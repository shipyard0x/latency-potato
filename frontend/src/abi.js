export const gameAbi = [
  { type: 'function', name: 'currentPrice', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'currentHolder', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'roundEndTime', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'jackpotPool', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'round', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'potatoPriceNow', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'takePotato', stateMutability: 'payable', inputs: [], outputs: [] },
  { type: 'function', name: 'takePotatoWithToken', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  { type: 'function', name: 'settleRound', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  {
    type: 'event', name: 'PotatoTaken',
    inputs: [
      { indexed: true, name: 'round', type: 'uint256' },
      { indexed: true, name: 'taker', type: 'address' },
      { indexed: true, name: 'previousHolder', type: 'address' },
      { indexed: false, name: 'pricePaid', type: 'uint256' },
      { indexed: false, name: 'newPrice', type: 'uint256' },
      { indexed: false, name: 'roundEndTime', type: 'uint256' },
      { indexed: false, name: 'paidInPotato', type: 'bool' },
    ],
  },
  {
    type: 'event', name: 'RoundSettled',
    inputs: [
      { indexed: true, name: 'round', type: 'uint256' },
      { indexed: true, name: 'winner', type: 'address' },
      { indexed: false, name: 'winnerPayout', type: 'uint256' },
      { indexed: false, name: 'rollover', type: 'uint256' },
      { indexed: false, name: 'devCut', type: 'uint256' },
    ],
  },
];

export const erc20Abi = [
  { type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'allowance', stateMutability: 'view', inputs: [{ type: 'address' }, { type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
];
