const { expect } = require('chai');
const { ethers, network } = require('hardhat');

const E = (v) => ethers.parseEther(String(v));
const BASE = E('0.005');
const RATE = E('1000000'); // 1M POTATO per ETH

async function warp(seconds) {
  await network.provider.send('evm_increaseTime', [seconds]);
  await network.provider.send('evm_mine');
}

describe('Latency Potato protocol', () => {
  let owner, alice, bob, carol, protocol, dev, pool;
  let token, game;

  beforeEach(async () => {
    [owner, alice, bob, carol, protocol, dev, pool] = await ethers.getSigners();
    token = await (await ethers.getContractFactory('PotatoToken')).deploy();
    game = await (await ethers.getContractFactory('LatencyPotato'))
      .deploy(protocol.address, dev.address);
    await token.setGameContract(await game.getAddress());
    await game.setPotatoToken(await token.getAddress());
    await game.setPotatoPerEth(RATE);
  });

  // ================================================================ token
  describe('PotatoToken', () => {
    it('mints 1B supply to deployer', async () => {
      expect(await token.totalSupply()).to.equal(E('1000000000'));
      expect(await token.balanceOf(owner.address)).to.equal(E('1000000000'));
    });

    it('does not tax wallet-to-wallet transfers', async () => {
      await token.transfer(alice.address, E('1000'));
      await token.connect(alice).transfer(bob.address, E('1000'));
      expect(await token.balanceOf(bob.address)).to.equal(E('1000'));
    });

    it('taxes swaps 3%: 1% burned, 2% to game', async () => {
      await token.transfer(alice.address, E('1000'));
      await token.setAmmPool(pool.address, true);
      await token.connect(alice).transfer(pool.address, E('1000')); // "sell"
      expect(await token.balanceOf(pool.address)).to.equal(E('970'));
      expect(await token.balanceOf('0x000000000000000000000000000000000000dEaD')).to.equal(E('10'));
      expect(await token.balanceOf(await game.getAddress())).to.equal(E('20'));
    });

    it('exempts flagged addresses from tax', async () => {
      await token.setAmmPool(pool.address, true);
      await token.setTaxExempt(alice.address, true);
      await token.transfer(alice.address, E('100'));
      await token.connect(alice).transfer(pool.address, E('100'));
      expect(await token.balanceOf(pool.address)).to.equal(E('100'));
    });

    it('supports EIP-2612 permit', async () => {
      const spender = bob.address;
      const value = E('50');
      const deadline = ethers.MaxUint256;
      const nonce = await token.nonces(owner.address);
      const domain = {
        name: 'Latency Potato', version: '1',
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: await token.getAddress(),
      };
      const types = { Permit: [
        { name: 'owner', type: 'address' }, { name: 'spender', type: 'address' },
        { name: 'value', type: 'uint256' }, { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
      ]};
      const sig = ethers.Signature.from(await owner.signTypedData(domain, types,
        { owner: owner.address, spender, value, nonce, deadline }));
      await token.permit(owner.address, spender, value, deadline, sig.v, sig.r, sig.s);
      expect(await token.allowance(owner.address, spender)).to.equal(value);
    });
  });

  // ================================================================ game core
  describe('takePotato (ETH)', () => {
    it('rejects wrong payment', async () => {
      await expect(game.connect(alice).takePotato({ value: E('0.004') }))
        .to.be.revertedWithCustomError(game, 'WrongPayment');
    });

    it('first take seeds jackpot and bumps price 10%', async () => {
      await game.connect(alice).takePotato({ value: BASE });
      expect(await game.currentHolder()).to.equal(alice.address);
      expect(await game.jackpotPool()).to.equal(BASE);
      expect(await game.currentPrice()).to.equal(BASE * 110n / 100n);
    });

    it('second take refunds prev holder +5%, splits 3/2', async () => {
      await game.connect(alice).takePotato({ value: BASE });
      const p2 = await game.currentPrice();
      const balBefore = await ethers.provider.getBalance(alice.address);
      const protBefore = await ethers.provider.getBalance(protocol.address);

      await game.connect(bob).takePotato({ value: p2 });

      expect(await ethers.provider.getBalance(alice.address) - balBefore)
        .to.equal(BASE * 105n / 100n);                       // +5% profit
      expect(await ethers.provider.getBalance(protocol.address) - protBefore)
        .to.equal(BASE * 2n / 100n);                         // protocol 2%
      expect(await game.jackpotPool()).to.equal(BASE + BASE * 3n / 100n); // +3%
      expect(await game.currentHolder()).to.equal(bob.address);
    });

    it('blocks grabbing your own potato', async () => {
      await game.connect(alice).takePotato({ value: BASE });
      const p2 = await game.currentPrice();
      await expect(game.connect(alice).takePotato({ value: p2 }))
        .to.be.revertedWithCustomError(game, 'AlreadyHolding');
    });

    it('price compounds 10% per take', async () => {
      await game.connect(alice).takePotato({ value: BASE });
      await game.connect(bob).takePotato({ value: await game.currentPrice() });
      await game.connect(carol).takePotato({ value: await game.currentPrice() });
      expect(await game.currentPrice())
        .to.equal(BASE * 110n / 100n * 110n / 100n * 110n / 100n);
    });
  });

  // ================================================================ settlement
  describe('settleRound', () => {
    it('reverts while round is live or idle', async () => {
      await expect(game.settleRound()).to.be.revertedWithCustomError(game, 'RoundNotOver');
      await game.connect(alice).takePotato({ value: BASE });
      await expect(game.settleRound()).to.be.revertedWithCustomError(game, 'RoundNotOver');
    });

    it('pays winner 50% + buy-in, dev 10%, rolls 40%', async () => {
      await game.connect(alice).takePotato({ value: BASE });
      const p2 = await game.currentPrice();
      await game.connect(bob).takePotato({ value: p2 });
      const pool0 = await game.jackpotPool();
      await warp(31);

      const bobBefore = await ethers.provider.getBalance(bob.address);
      const devBefore = await ethers.provider.getBalance(dev.address);
      await game.connect(carol).settleRound();

      const winnerCut = pool0 * 50n / 100n;
      const devCut = pool0 * 10n / 100n;
      expect(await ethers.provider.getBalance(bob.address) - bobBefore).to.equal(winnerCut);
      expect(await ethers.provider.getBalance(dev.address) - devBefore).to.equal(devCut);
      expect(await game.jackpotPool()).to.equal(pool0 - pool0 * 50n / 100n - devCut);
      expect(await game.currentHolder()).to.equal(ethers.ZeroAddress);
      expect(await game.currentPrice()).to.equal(BASE);
      expect(await game.wins(bob.address)).to.equal(1);
    });

    it('takePotato after expiry auto-settles and opens new round', async () => {
      await game.connect(alice).takePotato({ value: BASE });
      await warp(31);
      await game.connect(bob).takePotato({ value: BASE }); // base price again
      expect(await game.currentHolder()).to.equal(bob.address);
      expect(await game.round()).to.equal(2);
      expect(await game.wins(alice.address)).to.equal(1);
    });
  });

  // ================================================================ escrow
  describe('griefing resistance', () => {
    it('escrows refund for reverting receiver; withdraw() recovers it', async () => {
      const rr = await (await ethers.getContractFactory('RevertingReceiver')).deploy();
      await rr.setAccept(true);
      await game.connect(alice).takePotato({ value: BASE });
      const p2 = await game.currentPrice();
      await rr.take(await game.getAddress(), p2, { value: p2 });
      await rr.setAccept(false); // now it reverts on receive

      const p3 = await game.currentPrice();
      await game.connect(bob).takePotato({ value: p3 }); // must NOT revert
      const owed = p2 * 105n / 100n;
      expect(await game.pendingWithdrawals(await rr.getAddress())).to.equal(owed);

      await rr.setAccept(true);
      await rr.withdrawFrom(await game.getAddress());
      expect(await ethers.provider.getBalance(await rr.getAddress())).to.equal(owed);
    });
  });

  // ================================================================ POTATO path
  describe('takePotatoWithToken', () => {
    beforeEach(async () => {
      await token.transfer(alice.address, E('100000'));
      await token.connect(alice).approve(await game.getAddress(), ethers.MaxUint256);
    });

    it('burns discounted tokens and takes the potato', async () => {
      // seed jackpot so it can cover the (zero, first-take) obligation
      const cost = await game.potatoPriceNow();
      expect(cost).to.equal(BASE * RATE * 95n / (E('1') * 100n));
      const dead = '0x000000000000000000000000000000000000dEaD';
      const dead0 = await token.balanceOf(dead);
      await game.connect(alice).takePotatoWithToken();
      expect(await game.currentHolder()).to.equal(alice.address);
      expect(await token.balanceOf(dead) - dead0).to.equal(cost); // dead-burned
    });

    it('pays prev holder ETH refund out of the jackpot', async () => {
      await game.connect(bob).takePotato({ value: BASE }); // jackpot = BASE
      // token path draws refund(105%)+protocol(2%) from the pool — top it up
      // the way production does (tax inflow / donations)
      await owner.sendTransaction({ to: await game.getAddress(), value: E('0.01') });
      const bobBefore = await ethers.provider.getBalance(bob.address);
      await game.connect(alice).takePotatoWithToken();
      const refund = BASE * 105n / 100n;
      expect(await ethers.provider.getBalance(bob.address) - bobBefore).to.equal(refund);
      // jackpot lost refund(105%) + protocol(2%); no phantom 3% credit
      expect(await game.jackpotPool()).to.equal(BASE + E('0.01') - refund - BASE * 2n / 100n);
    });

    it('reverts when jackpot cannot cover the refund', async () => {
      await game.connect(bob).takePotato({ value: BASE });
      // jackpot holds exactly BASE, but obligation is 107% of BASE — must revert
      await expect(game.connect(alice).takePotatoWithToken())
        .to.be.revertedWithCustomError(game, 'InsufficientJackpotLiquidity');
    });
  });

  // ================================================================ funding paths
  describe('jackpot funding', () => {
    it('receive() routes ETH 100% into jackpot', async () => {
      await owner.sendTransaction({ to: await game.getAddress(), value: E('1') });
      expect(await game.jackpotPool()).to.equal(E('1'));
    });

    it('harvestSidepot converts token side-pot to jackpot ETH', async () => {
      const router = await (await ethers.getContractFactory('MockRouter')).deploy();
      await owner.sendTransaction({ to: await router.getAddress(), value: E('2') });
      await router.setEthOut(E('0.5'));
      await game.setSwapRouter(await router.getAddress(), owner.address /* weth stub */);

      // build a side-pot via a taxed swap
      await token.transfer(alice.address, E('1000'));
      await token.setAmmPool(pool.address, true);
      await token.connect(alice).transfer(pool.address, E('1000')); // 2% -> game
      expect(await token.balanceOf(await game.getAddress())).to.equal(E('20'));

      await game.harvestSidepot(E('0.4'));
      expect(await game.jackpotPool()).to.equal(E('0.5'));
      expect(await token.balanceOf(await game.getAddress())).to.equal(0);
    });

    it('stays solvent through mixed ETH/token/settle activity', async () => {
      // invariant: contract balance always covers jackpotPool + escrows
      await token.transfer(alice.address, E('1000000'));
      await token.connect(alice).approve(await game.getAddress(), ethers.MaxUint256);
      await owner.sendTransaction({ to: await game.getAddress(), value: E('0.05') });

      await game.connect(bob).takePotato({ value: BASE });
      await game.connect(alice).takePotatoWithToken();
      await game.connect(carol).takePotato({ value: await game.currentPrice() });
      await game.connect(bob).takePotato({ value: await game.currentPrice() });
      await warp(31);
      await game.settleRound();
      await game.connect(alice).takePotato({ value: BASE });
      await game.connect(bob).takePotato({ value: await game.currentPrice() });

      const bal = await ethers.provider.getBalance(await game.getAddress());
      expect(bal >= await game.jackpotPool()).to.equal(true);
    });

    it('oracle overrides the fallback rate', async () => {
      const oracle = await (await ethers.getContractFactory('MockOracle')).deploy(E('2000000'));
      await game.setOracle(await oracle.getAddress());
      expect(await game.potatoRate()).to.equal(E('2000000'));
      await game.setOracle(ethers.ZeroAddress);
      expect(await game.potatoRate()).to.equal(RATE);
    });
  });
});
