//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// EscrowDst
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const escrowDstAbi = [
  {
    type: 'constructor',
    inputs: [
      { name: 'rescueDelay', internalType: 'uint32', type: 'uint32' },
      { name: 'accessToken', internalType: 'contract IERC20', type: 'address' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'FACTORY',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'PROXY_BYTECODE_HASH',
    outputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'RESCUE_DELAY',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      {
        name: 'immutables',
        internalType: 'struct IBaseEscrow.Immutables',
        type: 'tuple',
        components: [
          { name: 'orderHash', internalType: 'bytes32', type: 'bytes32' },
          { name: 'hashlock', internalType: 'bytes32', type: 'bytes32' },
          { name: 'maker', internalType: 'Address', type: 'uint256' },
          { name: 'taker', internalType: 'Address', type: 'uint256' },
          { name: 'token', internalType: 'Address', type: 'uint256' },
          { name: 'amount', internalType: 'uint256', type: 'uint256' },
          { name: 'safetyDeposit', internalType: 'uint256', type: 'uint256' },
          { name: 'timelocks', internalType: 'Timelocks', type: 'uint256' },
        ],
      },
    ],
    name: 'cancel',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'secret', internalType: 'bytes32', type: 'bytes32' },
      {
        name: 'immutables',
        internalType: 'struct IBaseEscrow.Immutables',
        type: 'tuple',
        components: [
          { name: 'orderHash', internalType: 'bytes32', type: 'bytes32' },
          { name: 'hashlock', internalType: 'bytes32', type: 'bytes32' },
          { name: 'maker', internalType: 'Address', type: 'uint256' },
          { name: 'taker', internalType: 'Address', type: 'uint256' },
          { name: 'token', internalType: 'Address', type: 'uint256' },
          { name: 'amount', internalType: 'uint256', type: 'uint256' },
          { name: 'safetyDeposit', internalType: 'uint256', type: 'uint256' },
          { name: 'timelocks', internalType: 'Timelocks', type: 'uint256' },
        ],
      },
    ],
    name: 'publicWithdraw',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'token', internalType: 'address', type: 'address' },
      { name: 'amount', internalType: 'uint256', type: 'uint256' },
      {
        name: 'immutables',
        internalType: 'struct IBaseEscrow.Immutables',
        type: 'tuple',
        components: [
          { name: 'orderHash', internalType: 'bytes32', type: 'bytes32' },
          { name: 'hashlock', internalType: 'bytes32', type: 'bytes32' },
          { name: 'maker', internalType: 'Address', type: 'uint256' },
          { name: 'taker', internalType: 'Address', type: 'uint256' },
          { name: 'token', internalType: 'Address', type: 'uint256' },
          { name: 'amount', internalType: 'uint256', type: 'uint256' },
          { name: 'safetyDeposit', internalType: 'uint256', type: 'uint256' },
          { name: 'timelocks', internalType: 'Timelocks', type: 'uint256' },
        ],
      },
    ],
    name: 'rescueFunds',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'secret', internalType: 'bytes32', type: 'bytes32' },
      {
        name: 'immutables',
        internalType: 'struct IBaseEscrow.Immutables',
        type: 'tuple',
        components: [
          { name: 'orderHash', internalType: 'bytes32', type: 'bytes32' },
          { name: 'hashlock', internalType: 'bytes32', type: 'bytes32' },
          { name: 'maker', internalType: 'Address', type: 'uint256' },
          { name: 'taker', internalType: 'Address', type: 'uint256' },
          { name: 'token', internalType: 'Address', type: 'uint256' },
          { name: 'amount', internalType: 'uint256', type: 'uint256' },
          { name: 'safetyDeposit', internalType: 'uint256', type: 'uint256' },
          { name: 'timelocks', internalType: 'Timelocks', type: 'uint256' },
        ],
      },
    ],
    name: 'withdraw',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  { type: 'event', anonymous: false, inputs: [], name: 'EscrowCancelled' },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'secret',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: false,
      },
    ],
    name: 'EscrowWithdrawal',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'token',
        internalType: 'address',
        type: 'address',
        indexed: false,
      },
      {
        name: 'amount',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'FundsRescued',
  },
  { type: 'error', inputs: [], name: 'InvalidCaller' },
  { type: 'error', inputs: [], name: 'InvalidImmutables' },
  { type: 'error', inputs: [], name: 'InvalidSecret' },
  { type: 'error', inputs: [], name: 'InvalidTime' },
  { type: 'error', inputs: [], name: 'NativeTokenSendingFailure' },
  { type: 'error', inputs: [], name: 'SafeTransferFailed' },
] as const

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// EscrowDstV2
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const escrowDstV2Abi = [
  {
    type: 'constructor',
    inputs: [
      { name: 'rescueDelay', internalType: 'uint32', type: 'uint32' },
      { name: 'accessToken', internalType: 'contract IERC20', type: 'address' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'FACTORY',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'PROXY_BYTECODE_HASH',
    outputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'RESCUE_DELAY',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'orderHash', internalType: 'bytes32', type: 'bytes32' },
      { name: 'caller', internalType: 'address', type: 'address' },
      { name: 'action', internalType: 'string', type: 'string' },
    ],
    name: '_hashPublicAction',
    outputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'digest', internalType: 'bytes32', type: 'bytes32' },
      { name: 'sig', internalType: 'bytes', type: 'bytes' },
    ],
    name: '_recover',
    outputs: [{ name: 'signer', internalType: 'address', type: 'address' }],
    stateMutability: 'pure',
  },
  {
    type: 'function',
    inputs: [
      {
        name: 'immutables',
        internalType: 'struct IBaseEscrow.Immutables',
        type: 'tuple',
        components: [
          { name: 'orderHash', internalType: 'bytes32', type: 'bytes32' },
          { name: 'hashlock', internalType: 'bytes32', type: 'bytes32' },
          { name: 'maker', internalType: 'Address', type: 'uint256' },
          { name: 'taker', internalType: 'Address', type: 'uint256' },
          { name: 'token', internalType: 'Address', type: 'uint256' },
          { name: 'amount', internalType: 'uint256', type: 'uint256' },
          { name: 'safetyDeposit', internalType: 'uint256', type: 'uint256' },
          { name: 'timelocks', internalType: 'Timelocks', type: 'uint256' },
        ],
      },
    ],
    name: 'cancel',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      {
        name: 'immutables',
        internalType: 'struct IBaseEscrow.Immutables',
        type: 'tuple',
        components: [
          { name: 'orderHash', internalType: 'bytes32', type: 'bytes32' },
          { name: 'hashlock', internalType: 'bytes32', type: 'bytes32' },
          { name: 'maker', internalType: 'Address', type: 'uint256' },
          { name: 'taker', internalType: 'Address', type: 'uint256' },
          { name: 'token', internalType: 'Address', type: 'uint256' },
          { name: 'amount', internalType: 'uint256', type: 'uint256' },
          { name: 'safetyDeposit', internalType: 'uint256', type: 'uint256' },
          { name: 'timelocks', internalType: 'Timelocks', type: 'uint256' },
        ],
      },
      { name: 'resolverSignature', internalType: 'bytes', type: 'bytes' },
    ],
    name: 'publicCancelSigned',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'secret', internalType: 'bytes32', type: 'bytes32' },
      {
        name: 'immutables',
        internalType: 'struct IBaseEscrow.Immutables',
        type: 'tuple',
        components: [
          { name: 'orderHash', internalType: 'bytes32', type: 'bytes32' },
          { name: 'hashlock', internalType: 'bytes32', type: 'bytes32' },
          { name: 'maker', internalType: 'Address', type: 'uint256' },
          { name: 'taker', internalType: 'Address', type: 'uint256' },
          { name: 'token', internalType: 'Address', type: 'uint256' },
          { name: 'amount', internalType: 'uint256', type: 'uint256' },
          { name: 'safetyDeposit', internalType: 'uint256', type: 'uint256' },
          { name: 'timelocks', internalType: 'Timelocks', type: 'uint256' },
        ],
      },
    ],
    name: 'publicWithdraw',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'secret', internalType: 'bytes32', type: 'bytes32' },
      {
        name: 'immutables',
        internalType: 'struct IBaseEscrow.Immutables',
        type: 'tuple',
        components: [
          { name: 'orderHash', internalType: 'bytes32', type: 'bytes32' },
          { name: 'hashlock', internalType: 'bytes32', type: 'bytes32' },
          { name: 'maker', internalType: 'Address', type: 'uint256' },
          { name: 'taker', internalType: 'Address', type: 'uint256' },
          { name: 'token', internalType: 'Address', type: 'uint256' },
          { name: 'amount', internalType: 'uint256', type: 'uint256' },
          { name: 'safetyDeposit', internalType: 'uint256', type: 'uint256' },
          { name: 'timelocks', internalType: 'Timelocks', type: 'uint256' },
        ],
      },
      { name: 'resolverSignature', internalType: 'bytes', type: 'bytes' },
    ],
    name: 'publicWithdrawSigned',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'token', internalType: 'address', type: 'address' },
      { name: 'amount', internalType: 'uint256', type: 'uint256' },
      {
        name: 'immutables',
        internalType: 'struct IBaseEscrow.Immutables',
        type: 'tuple',
        components: [
          { name: 'orderHash', internalType: 'bytes32', type: 'bytes32' },
          { name: 'hashlock', internalType: 'bytes32', type: 'bytes32' },
          { name: 'maker', internalType: 'Address', type: 'uint256' },
          { name: 'taker', internalType: 'Address', type: 'uint256' },
          { name: 'token', internalType: 'Address', type: 'uint256' },
          { name: 'amount', internalType: 'uint256', type: 'uint256' },
          { name: 'safetyDeposit', internalType: 'uint256', type: 'uint256' },
          { name: 'timelocks', internalType: 'Timelocks', type: 'uint256' },
        ],
      },
    ],
    name: 'rescueFunds',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'secret', internalType: 'bytes32', type: 'bytes32' },
      {
        name: 'immutables',
        internalType: 'struct IBaseEscrow.Immutables',
        type: 'tuple',
        components: [
          { name: 'orderHash', internalType: 'bytes32', type: 'bytes32' },
          { name: 'hashlock', internalType: 'bytes32', type: 'bytes32' },
          { name: 'maker', internalType: 'Address', type: 'uint256' },
          { name: 'taker', internalType: 'Address', type: 'uint256' },
          { name: 'token', internalType: 'Address', type: 'uint256' },
          { name: 'amount', internalType: 'uint256', type: 'uint256' },
          { name: 'safetyDeposit', internalType: 'uint256', type: 'uint256' },
          { name: 'timelocks', internalType: 'Timelocks', type: 'uint256' },
        ],
      },
    ],
    name: 'withdraw',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  { type: 'event', anonymous: false, inputs: [], name: 'EscrowCancelled' },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'secret',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: false,
      },
    ],
    name: 'EscrowWithdrawal',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'token',
        internalType: 'address',
        type: 'address',
        indexed: false,
      },
      {
        name: 'amount',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'FundsRescued',
  },
  { type: 'error', inputs: [], name: 'InvalidCaller' },
  { type: 'error', inputs: [], name: 'InvalidImmutables' },
  { type: 'error', inputs: [], name: 'InvalidSecret' },
  { type: 'error', inputs: [], name: 'InvalidTime' },
  { type: 'error', inputs: [], name: 'NativeTokenSendingFailure' },
  { type: 'error', inputs: [], name: 'SafeTransferFailed' },
] as const

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// EscrowSrcV2
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const escrowSrcV2Abi = [
  {
    type: 'constructor',
    inputs: [
      { name: 'rescueDelay', internalType: 'uint32', type: 'uint32' },
      { name: 'accessToken', internalType: 'contract IERC20', type: 'address' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'FACTORY',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'PROXY_BYTECODE_HASH',
    outputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'RESCUE_DELAY',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'orderHash', internalType: 'bytes32', type: 'bytes32' },
      { name: 'caller', internalType: 'address', type: 'address' },
      { name: 'action', internalType: 'string', type: 'string' },
    ],
    name: '_hashPublicAction',
    outputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'digest', internalType: 'bytes32', type: 'bytes32' },
      { name: 'sig', internalType: 'bytes', type: 'bytes' },
    ],
    name: '_recover',
    outputs: [{ name: 'signer', internalType: 'address', type: 'address' }],
    stateMutability: 'pure',
  },
  {
    type: 'function',
    inputs: [
      {
        name: 'immutables',
        internalType: 'struct IBaseEscrow.Immutables',
        type: 'tuple',
        components: [
          { name: 'orderHash', internalType: 'bytes32', type: 'bytes32' },
          { name: 'hashlock', internalType: 'bytes32', type: 'bytes32' },
          { name: 'maker', internalType: 'Address', type: 'uint256' },
          { name: 'taker', internalType: 'Address', type: 'uint256' },
          { name: 'token', internalType: 'Address', type: 'uint256' },
          { name: 'amount', internalType: 'uint256', type: 'uint256' },
          { name: 'safetyDeposit', internalType: 'uint256', type: 'uint256' },
          { name: 'timelocks', internalType: 'Timelocks', type: 'uint256' },
        ],
      },
    ],
    name: 'cancel',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      {
        name: 'immutables',
        internalType: 'struct IBaseEscrow.Immutables',
        type: 'tuple',
        components: [
          { name: 'orderHash', internalType: 'bytes32', type: 'bytes32' },
          { name: 'hashlock', internalType: 'bytes32', type: 'bytes32' },
          { name: 'maker', internalType: 'Address', type: 'uint256' },
          { name: 'taker', internalType: 'Address', type: 'uint256' },
          { name: 'token', internalType: 'Address', type: 'uint256' },
          { name: 'amount', internalType: 'uint256', type: 'uint256' },
          { name: 'safetyDeposit', internalType: 'uint256', type: 'uint256' },
          { name: 'timelocks', internalType: 'Timelocks', type: 'uint256' },
        ],
      },
    ],
    name: 'publicCancel',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      {
        name: 'immutables',
        internalType: 'struct IBaseEscrow.Immutables',
        type: 'tuple',
        components: [
          { name: 'orderHash', internalType: 'bytes32', type: 'bytes32' },
          { name: 'hashlock', internalType: 'bytes32', type: 'bytes32' },
          { name: 'maker', internalType: 'Address', type: 'uint256' },
          { name: 'taker', internalType: 'Address', type: 'uint256' },
          { name: 'token', internalType: 'Address', type: 'uint256' },
          { name: 'amount', internalType: 'uint256', type: 'uint256' },
          { name: 'safetyDeposit', internalType: 'uint256', type: 'uint256' },
          { name: 'timelocks', internalType: 'Timelocks', type: 'uint256' },
        ],
      },
      { name: 'resolverSignature', internalType: 'bytes', type: 'bytes' },
    ],
    name: 'publicCancelSigned',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'secret', internalType: 'bytes32', type: 'bytes32' },
      {
        name: 'immutables',
        internalType: 'struct IBaseEscrow.Immutables',
        type: 'tuple',
        components: [
          { name: 'orderHash', internalType: 'bytes32', type: 'bytes32' },
          { name: 'hashlock', internalType: 'bytes32', type: 'bytes32' },
          { name: 'maker', internalType: 'Address', type: 'uint256' },
          { name: 'taker', internalType: 'Address', type: 'uint256' },
          { name: 'token', internalType: 'Address', type: 'uint256' },
          { name: 'amount', internalType: 'uint256', type: 'uint256' },
          { name: 'safetyDeposit', internalType: 'uint256', type: 'uint256' },
          { name: 'timelocks', internalType: 'Timelocks', type: 'uint256' },
        ],
      },
    ],
    name: 'publicWithdraw',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'secret', internalType: 'bytes32', type: 'bytes32' },
      {
        name: 'immutables',
        internalType: 'struct IBaseEscrow.Immutables',
        type: 'tuple',
        components: [
          { name: 'orderHash', internalType: 'bytes32', type: 'bytes32' },
          { name: 'hashlock', internalType: 'bytes32', type: 'bytes32' },
          { name: 'maker', internalType: 'Address', type: 'uint256' },
          { name: 'taker', internalType: 'Address', type: 'uint256' },
          { name: 'token', internalType: 'Address', type: 'uint256' },
          { name: 'amount', internalType: 'uint256', type: 'uint256' },
          { name: 'safetyDeposit', internalType: 'uint256', type: 'uint256' },
          { name: 'timelocks', internalType: 'Timelocks', type: 'uint256' },
        ],
      },
      { name: 'resolverSignature', internalType: 'bytes', type: 'bytes' },
    ],
    name: 'publicWithdrawSigned',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'token', internalType: 'address', type: 'address' },
      { name: 'amount', internalType: 'uint256', type: 'uint256' },
      {
        name: 'immutables',
        internalType: 'struct IBaseEscrow.Immutables',
        type: 'tuple',
        components: [
          { name: 'orderHash', internalType: 'bytes32', type: 'bytes32' },
          { name: 'hashlock', internalType: 'bytes32', type: 'bytes32' },
          { name: 'maker', internalType: 'Address', type: 'uint256' },
          { name: 'taker', internalType: 'Address', type: 'uint256' },
          { name: 'token', internalType: 'Address', type: 'uint256' },
          { name: 'amount', internalType: 'uint256', type: 'uint256' },
          { name: 'safetyDeposit', internalType: 'uint256', type: 'uint256' },
          { name: 'timelocks', internalType: 'Timelocks', type: 'uint256' },
        ],
      },
    ],
    name: 'rescueFunds',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'secret', internalType: 'bytes32', type: 'bytes32' },
      {
        name: 'immutables',
        internalType: 'struct IBaseEscrow.Immutables',
        type: 'tuple',
        components: [
          { name: 'orderHash', internalType: 'bytes32', type: 'bytes32' },
          { name: 'hashlock', internalType: 'bytes32', type: 'bytes32' },
          { name: 'maker', internalType: 'Address', type: 'uint256' },
          { name: 'taker', internalType: 'Address', type: 'uint256' },
          { name: 'token', internalType: 'Address', type: 'uint256' },
          { name: 'amount', internalType: 'uint256', type: 'uint256' },
          { name: 'safetyDeposit', internalType: 'uint256', type: 'uint256' },
          { name: 'timelocks', internalType: 'Timelocks', type: 'uint256' },
        ],
      },
    ],
    name: 'withdraw',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'secret', internalType: 'bytes32', type: 'bytes32' },
      { name: 'target', internalType: 'address', type: 'address' },
      {
        name: 'immutables',
        internalType: 'struct IBaseEscrow.Immutables',
        type: 'tuple',
        components: [
          { name: 'orderHash', internalType: 'bytes32', type: 'bytes32' },
          { name: 'hashlock', internalType: 'bytes32', type: 'bytes32' },
          { name: 'maker', internalType: 'Address', type: 'uint256' },
          { name: 'taker', internalType: 'Address', type: 'uint256' },
          { name: 'token', internalType: 'Address', type: 'uint256' },
          { name: 'amount', internalType: 'uint256', type: 'uint256' },
          { name: 'safetyDeposit', internalType: 'uint256', type: 'uint256' },
          { name: 'timelocks', internalType: 'Timelocks', type: 'uint256' },
        ],
      },
    ],
    name: 'withdrawTo',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  { type: 'event', anonymous: false, inputs: [], name: 'EscrowCancelled' },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'secret',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: false,
      },
    ],
    name: 'EscrowWithdrawal',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'token',
        internalType: 'address',
        type: 'address',
        indexed: false,
      },
      {
        name: 'amount',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'FundsRescued',
  },
  { type: 'error', inputs: [], name: 'InvalidCaller' },
  { type: 'error', inputs: [], name: 'InvalidImmutables' },
  { type: 'error', inputs: [], name: 'InvalidSecret' },
  { type: 'error', inputs: [], name: 'InvalidTime' },
  { type: 'error', inputs: [], name: 'NativeTokenSendingFailure' },
  { type: 'error', inputs: [], name: 'SafeTransferFailed' },
] as const

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// IERC20
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const ierc20Abi = [
  {
    type: 'function',
    inputs: [
      { name: 'owner', internalType: 'address', type: 'address' },
      { name: 'spender', internalType: 'address', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'spender', internalType: 'address', type: 'address' },
      { name: 'value', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'account', internalType: 'address', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'totalSupply',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'to', internalType: 'address', type: 'address' },
      { name: 'value', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'transfer',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'from', internalType: 'address', type: 'address' },
      { name: 'to', internalType: 'address', type: 'address' },
      { name: 'value', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'transferFrom',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'owner',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'spender',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'value',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'Approval',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      { name: 'from', internalType: 'address', type: 'address', indexed: true },
      { name: 'to', internalType: 'address', type: 'address', indexed: true },
      {
        name: 'value',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'Transfer',
  },
] as const

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// SimpleLimitOrderProtocol
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 */
export const simpleLimitOrderProtocolAbi = [
  {
    type: 'constructor',
    inputs: [
      { name: '_weth', internalType: 'contract IWETH', type: 'address' },
    ],
    stateMutability: 'nonpayable',
  },
  { type: 'receive', stateMutability: 'payable' },
  {
    type: 'function',
    inputs: [],
    name: 'DOMAIN_SEPARATOR',
    outputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'series', internalType: 'uint96', type: 'uint96' },
      { name: 'amount', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'advanceEpoch',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'offsets', internalType: 'uint256', type: 'uint256' },
      { name: 'data', internalType: 'bytes', type: 'bytes' },
    ],
    name: 'and',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'target', internalType: 'address', type: 'address' },
      { name: 'data', internalType: 'bytes', type: 'bytes' },
    ],
    name: 'arbitraryStaticCall',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'maker', internalType: 'address', type: 'address' },
      { name: 'slot', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'bitInvalidatorForOrder',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'makerTraits', internalType: 'MakerTraits', type: 'uint256' },
      { name: 'additionalMask', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'bitsInvalidateForOrder',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'makerTraits', internalType: 'MakerTraits', type: 'uint256' },
      { name: 'orderHash', internalType: 'bytes32', type: 'bytes32' },
    ],
    name: 'cancelOrder',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'makerTraits', internalType: 'MakerTraits[]', type: 'uint256[]' },
      { name: 'orderHashes', internalType: 'bytes32[]', type: 'bytes32[]' },
    ],
    name: 'cancelOrders',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'predicate', internalType: 'bytes', type: 'bytes' }],
    name: 'checkPredicate',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'eip712Domain',
    outputs: [
      { name: 'fields', internalType: 'bytes1', type: 'bytes1' },
      { name: 'name', internalType: 'string', type: 'string' },
      { name: 'version', internalType: 'string', type: 'string' },
      { name: 'chainId', internalType: 'uint256', type: 'uint256' },
      { name: 'verifyingContract', internalType: 'address', type: 'address' },
      { name: 'salt', internalType: 'bytes32', type: 'bytes32' },
      { name: 'extensions', internalType: 'uint256[]', type: 'uint256[]' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'maker', internalType: 'address', type: 'address' },
      { name: 'series', internalType: 'uint96', type: 'uint96' },
    ],
    name: 'epoch',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'maker', internalType: 'address', type: 'address' },
      { name: 'series', internalType: 'uint256', type: 'uint256' },
      { name: 'makerEpoch', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'epochEquals',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'value', internalType: 'uint256', type: 'uint256' },
      { name: 'data', internalType: 'bytes', type: 'bytes' },
    ],
    name: 'eq',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      {
        name: 'order',
        internalType: 'struct IOrderMixin.Order',
        type: 'tuple',
        components: [
          { name: 'salt', internalType: 'uint256', type: 'uint256' },
          { name: 'maker', internalType: 'Address', type: 'uint256' },
          { name: 'receiver', internalType: 'Address', type: 'uint256' },
          { name: 'makerAsset', internalType: 'Address', type: 'uint256' },
          { name: 'takerAsset', internalType: 'Address', type: 'uint256' },
          { name: 'makingAmount', internalType: 'uint256', type: 'uint256' },
          { name: 'takingAmount', internalType: 'uint256', type: 'uint256' },
          { name: 'makerTraits', internalType: 'MakerTraits', type: 'uint256' },
        ],
      },
      { name: 'signature', internalType: 'bytes', type: 'bytes' },
      { name: 'amount', internalType: 'uint256', type: 'uint256' },
      { name: 'takerTraits', internalType: 'TakerTraits', type: 'uint256' },
    ],
    name: 'fillContractOrder',
    outputs: [
      { name: '', internalType: 'uint256', type: 'uint256' },
      { name: '', internalType: 'uint256', type: 'uint256' },
      { name: '', internalType: 'bytes32', type: 'bytes32' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      {
        name: 'order',
        internalType: 'struct IOrderMixin.Order',
        type: 'tuple',
        components: [
          { name: 'salt', internalType: 'uint256', type: 'uint256' },
          { name: 'maker', internalType: 'Address', type: 'uint256' },
          { name: 'receiver', internalType: 'Address', type: 'uint256' },
          { name: 'makerAsset', internalType: 'Address', type: 'uint256' },
          { name: 'takerAsset', internalType: 'Address', type: 'uint256' },
          { name: 'makingAmount', internalType: 'uint256', type: 'uint256' },
          { name: 'takingAmount', internalType: 'uint256', type: 'uint256' },
          { name: 'makerTraits', internalType: 'MakerTraits', type: 'uint256' },
        ],
      },
      { name: 'signature', internalType: 'bytes', type: 'bytes' },
      { name: 'amount', internalType: 'uint256', type: 'uint256' },
      { name: 'takerTraits', internalType: 'TakerTraits', type: 'uint256' },
      { name: 'args', internalType: 'bytes', type: 'bytes' },
    ],
    name: 'fillContractOrderArgs',
    outputs: [
      { name: '', internalType: 'uint256', type: 'uint256' },
      { name: '', internalType: 'uint256', type: 'uint256' },
      { name: '', internalType: 'bytes32', type: 'bytes32' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      {
        name: 'order',
        internalType: 'struct IOrderMixin.Order',
        type: 'tuple',
        components: [
          { name: 'salt', internalType: 'uint256', type: 'uint256' },
          { name: 'maker', internalType: 'Address', type: 'uint256' },
          { name: 'receiver', internalType: 'Address', type: 'uint256' },
          { name: 'makerAsset', internalType: 'Address', type: 'uint256' },
          { name: 'takerAsset', internalType: 'Address', type: 'uint256' },
          { name: 'makingAmount', internalType: 'uint256', type: 'uint256' },
          { name: 'takingAmount', internalType: 'uint256', type: 'uint256' },
          { name: 'makerTraits', internalType: 'MakerTraits', type: 'uint256' },
        ],
      },
      { name: 'r', internalType: 'bytes32', type: 'bytes32' },
      { name: 'vs', internalType: 'bytes32', type: 'bytes32' },
      { name: 'amount', internalType: 'uint256', type: 'uint256' },
      { name: 'takerTraits', internalType: 'TakerTraits', type: 'uint256' },
    ],
    name: 'fillOrder',
    outputs: [
      { name: '', internalType: 'uint256', type: 'uint256' },
      { name: '', internalType: 'uint256', type: 'uint256' },
      { name: '', internalType: 'bytes32', type: 'bytes32' },
    ],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    inputs: [
      {
        name: 'order',
        internalType: 'struct IOrderMixin.Order',
        type: 'tuple',
        components: [
          { name: 'salt', internalType: 'uint256', type: 'uint256' },
          { name: 'maker', internalType: 'Address', type: 'uint256' },
          { name: 'receiver', internalType: 'Address', type: 'uint256' },
          { name: 'makerAsset', internalType: 'Address', type: 'uint256' },
          { name: 'takerAsset', internalType: 'Address', type: 'uint256' },
          { name: 'makingAmount', internalType: 'uint256', type: 'uint256' },
          { name: 'takingAmount', internalType: 'uint256', type: 'uint256' },
          { name: 'makerTraits', internalType: 'MakerTraits', type: 'uint256' },
        ],
      },
      { name: 'r', internalType: 'bytes32', type: 'bytes32' },
      { name: 'vs', internalType: 'bytes32', type: 'bytes32' },
      { name: 'amount', internalType: 'uint256', type: 'uint256' },
      { name: 'takerTraits', internalType: 'TakerTraits', type: 'uint256' },
      { name: 'args', internalType: 'bytes', type: 'bytes' },
    ],
    name: 'fillOrderArgs',
    outputs: [
      { name: '', internalType: 'uint256', type: 'uint256' },
      { name: '', internalType: 'uint256', type: 'uint256' },
      { name: '', internalType: 'bytes32', type: 'bytes32' },
    ],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'value', internalType: 'uint256', type: 'uint256' },
      { name: 'data', internalType: 'bytes', type: 'bytes' },
    ],
    name: 'gt',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      {
        name: 'order',
        internalType: 'struct IOrderMixin.Order',
        type: 'tuple',
        components: [
          { name: 'salt', internalType: 'uint256', type: 'uint256' },
          { name: 'maker', internalType: 'Address', type: 'uint256' },
          { name: 'receiver', internalType: 'Address', type: 'uint256' },
          { name: 'makerAsset', internalType: 'Address', type: 'uint256' },
          { name: 'takerAsset', internalType: 'Address', type: 'uint256' },
          { name: 'makingAmount', internalType: 'uint256', type: 'uint256' },
          { name: 'takingAmount', internalType: 'uint256', type: 'uint256' },
          { name: 'makerTraits', internalType: 'MakerTraits', type: 'uint256' },
        ],
      },
    ],
    name: 'hashOrder',
    outputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'series', internalType: 'uint96', type: 'uint96' }],
    name: 'increaseEpoch',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'value', internalType: 'uint256', type: 'uint256' },
      { name: 'data', internalType: 'bytes', type: 'bytes' },
    ],
    name: 'lt',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'data', internalType: 'bytes', type: 'bytes' }],
    name: 'not',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'offsets', internalType: 'uint256', type: 'uint256' },
      { name: 'data', internalType: 'bytes', type: 'bytes' },
    ],
    name: 'or',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'paused',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'permit', internalType: 'bytes', type: 'bytes' },
      { name: 'action', internalType: 'bytes', type: 'bytes' },
    ],
    name: 'permitAndCall',
    outputs: [],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    inputs: [
      { name: 'maker', internalType: 'address', type: 'address' },
      { name: 'orderHash', internalType: 'bytes32', type: 'bytes32' },
    ],
    name: 'rawRemainingInvalidatorForOrder',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'maker', internalType: 'address', type: 'address' },
      { name: 'orderHash', internalType: 'bytes32', type: 'bytes32' },
    ],
    name: 'remainingInvalidatorForOrder',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      { name: 'target', internalType: 'address', type: 'address' },
      { name: 'data', internalType: 'bytes', type: 'bytes' },
    ],
    name: 'simulate',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'maker',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'slotIndex',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'slotValue',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'BitInvalidatorUpdated',
  },
  { type: 'event', anonymous: false, inputs: [], name: 'EIP712DomainChanged' },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'maker',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'series',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'newEpoch',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'EpochIncreased',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'orderHash',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: false,
      },
    ],
    name: 'OrderCancelled',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'orderHash',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: false,
      },
      {
        name: 'remainingAmount',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'OrderFilled',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'account',
        internalType: 'address',
        type: 'address',
        indexed: false,
      },
    ],
    name: 'Paused',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'account',
        internalType: 'address',
        type: 'address',
        indexed: false,
      },
    ],
    name: 'Unpaused',
  },
  { type: 'error', inputs: [], name: 'AdvanceEpochFailed' },
  { type: 'error', inputs: [], name: 'ArbitraryStaticCallFailed' },
  { type: 'error', inputs: [], name: 'BadSignature' },
  { type: 'error', inputs: [], name: 'BitInvalidatedOrder' },
  { type: 'error', inputs: [], name: 'ETHTransferFailed' },
  { type: 'error', inputs: [], name: 'EnforcedPause' },
  {
    type: 'error',
    inputs: [],
    name: 'EpochManagerAndBitInvalidatorsAreIncompatible',
  },
  { type: 'error', inputs: [], name: 'EthDepositRejected' },
  { type: 'error', inputs: [], name: 'ExpectedPause' },
  { type: 'error', inputs: [], name: 'InvalidMsgValue' },
  { type: 'error', inputs: [], name: 'InvalidPermit2Transfer' },
  { type: 'error', inputs: [], name: 'InvalidShortString' },
  { type: 'error', inputs: [], name: 'InvalidatedOrder' },
  { type: 'error', inputs: [], name: 'MakingAmountTooLow' },
  { type: 'error', inputs: [], name: 'MismatchArraysLengths' },
  { type: 'error', inputs: [], name: 'OrderExpired' },
  { type: 'error', inputs: [], name: 'OrderIsNotSuitableForMassInvalidation' },
  { type: 'error', inputs: [], name: 'PartialFillNotAllowed' },
  { type: 'error', inputs: [], name: 'Permit2TransferAmountTooHigh' },
  { type: 'error', inputs: [], name: 'PredicateIsNotTrue' },
  { type: 'error', inputs: [], name: 'PrivateOrder' },
  { type: 'error', inputs: [], name: 'ReentrancyDetected' },
  { type: 'error', inputs: [], name: 'RemainingInvalidatedOrder' },
  { type: 'error', inputs: [], name: 'SafeTransferFailed' },
  { type: 'error', inputs: [], name: 'SafeTransferFromFailed' },
  {
    type: 'error',
    inputs: [
      { name: 'success', internalType: 'bool', type: 'bool' },
      { name: 'res', internalType: 'bytes', type: 'bytes' },
    ],
    name: 'SimulationResults',
  },
  {
    type: 'error',
    inputs: [{ name: 'str', internalType: 'string', type: 'string' }],
    name: 'StringTooLong',
  },
  { type: 'error', inputs: [], name: 'SwapWithZeroAmount' },
  { type: 'error', inputs: [], name: 'TakingAmountExceeded' },
  { type: 'error', inputs: [], name: 'TakingAmountTooHigh' },
  { type: 'error', inputs: [], name: 'TransferFromMakerToTakerFailed' },
  { type: 'error', inputs: [], name: 'TransferFromTakerToMakerFailed' },
  { type: 'error', inputs: [], name: 'WrongSeriesNonce' },
] as const

/**
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 */
export const simpleLimitOrderProtocolAddress = {
  10: '0xe767105dcfB3034a346578afd2aFD8e583171489',
  8453: '0xe767105dcfB3034a346578afd2aFD8e583171489',
} as const

/**
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xe767105dcfB3034a346578afd2aFD8e583171489)
 */
export const simpleLimitOrderProtocolConfig = {
  address: simpleLimitOrderProtocolAddress,
  abi: simpleLimitOrderProtocolAbi,
} as const

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// SimplifiedEscrowFactory
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const simplifiedEscrowFactoryAbi = [
  {
    type: 'constructor',
    inputs: [
      { name: 'srcImpl', internalType: 'address', type: 'address' },
      { name: 'dstImpl', internalType: 'address', type: 'address' },
      { name: '_owner', internalType: 'address', type: 'address' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'ESCROW_DST_IMPLEMENTATION',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'ESCROW_SRC_IMPLEMENTATION',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'maker', internalType: 'address', type: 'address' }],
    name: 'addMaker',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'resolver', internalType: 'address', type: 'address' }],
    name: 'addResolver',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      {
        name: 'immutables',
        internalType: 'struct IBaseEscrow.Immutables',
        type: 'tuple',
        components: [
          { name: 'orderHash', internalType: 'bytes32', type: 'bytes32' },
          { name: 'hashlock', internalType: 'bytes32', type: 'bytes32' },
          { name: 'maker', internalType: 'Address', type: 'uint256' },
          { name: 'taker', internalType: 'Address', type: 'uint256' },
          { name: 'token', internalType: 'Address', type: 'uint256' },
          { name: 'amount', internalType: 'uint256', type: 'uint256' },
          { name: 'safetyDeposit', internalType: 'uint256', type: 'uint256' },
          { name: 'timelocks', internalType: 'Timelocks', type: 'uint256' },
        ],
      },
      { name: 'isSrc', internalType: 'bool', type: 'bool' },
    ],
    name: 'addressOfEscrow',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      {
        name: 'immutables',
        internalType: 'struct IBaseEscrow.Immutables',
        type: 'tuple',
        components: [
          { name: 'orderHash', internalType: 'bytes32', type: 'bytes32' },
          { name: 'hashlock', internalType: 'bytes32', type: 'bytes32' },
          { name: 'maker', internalType: 'Address', type: 'uint256' },
          { name: 'taker', internalType: 'Address', type: 'uint256' },
          { name: 'token', internalType: 'Address', type: 'uint256' },
          { name: 'amount', internalType: 'uint256', type: 'uint256' },
          { name: 'safetyDeposit', internalType: 'uint256', type: 'uint256' },
          { name: 'timelocks', internalType: 'Timelocks', type: 'uint256' },
        ],
      },
    ],
    name: 'createDstEscrow',
    outputs: [{ name: 'escrow', internalType: 'address', type: 'address' }],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    inputs: [
      {
        name: 'immutables',
        internalType: 'struct IBaseEscrow.Immutables',
        type: 'tuple',
        components: [
          { name: 'orderHash', internalType: 'bytes32', type: 'bytes32' },
          { name: 'hashlock', internalType: 'bytes32', type: 'bytes32' },
          { name: 'maker', internalType: 'Address', type: 'uint256' },
          { name: 'taker', internalType: 'Address', type: 'uint256' },
          { name: 'token', internalType: 'Address', type: 'uint256' },
          { name: 'amount', internalType: 'uint256', type: 'uint256' },
          { name: 'safetyDeposit', internalType: 'uint256', type: 'uint256' },
          { name: 'timelocks', internalType: 'Timelocks', type: 'uint256' },
        ],
      },
      { name: 'maker', internalType: 'address', type: 'address' },
      { name: 'token', internalType: 'address', type: 'address' },
      { name: 'amount', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'createSrcEscrow',
    outputs: [{ name: 'escrow', internalType: 'address', type: 'address' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'emergencyPaused',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
    name: 'escrows',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'makerWhitelistEnabled',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'owner',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'pause',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      {
        name: 'order',
        internalType: 'struct IOrderMixin.Order',
        type: 'tuple',
        components: [
          { name: 'salt', internalType: 'uint256', type: 'uint256' },
          { name: 'maker', internalType: 'Address', type: 'uint256' },
          { name: 'receiver', internalType: 'Address', type: 'uint256' },
          { name: 'makerAsset', internalType: 'Address', type: 'uint256' },
          { name: 'takerAsset', internalType: 'Address', type: 'uint256' },
          { name: 'makingAmount', internalType: 'uint256', type: 'uint256' },
          { name: 'takingAmount', internalType: 'uint256', type: 'uint256' },
          { name: 'makerTraits', internalType: 'MakerTraits', type: 'uint256' },
        ],
      },
      { name: '', internalType: 'bytes', type: 'bytes' },
      { name: 'orderHash', internalType: 'bytes32', type: 'bytes32' },
      { name: 'taker', internalType: 'address', type: 'address' },
      { name: 'makingAmount', internalType: 'uint256', type: 'uint256' },
      { name: '', internalType: 'uint256', type: 'uint256' },
      { name: '', internalType: 'uint256', type: 'uint256' },
      { name: 'extraData', internalType: 'bytes', type: 'bytes' },
    ],
    name: 'postInteraction',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'maker', internalType: 'address', type: 'address' }],
    name: 'removeMaker',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'resolver', internalType: 'address', type: 'address' }],
    name: 'removeResolver',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'resolverCount',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'enabled', internalType: 'bool', type: 'bool' }],
    name: 'setMakerWhitelistEnabled',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'newOwner', internalType: 'address', type: 'address' }],
    name: 'transferOwnership',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'unpause',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: '', internalType: 'address', type: 'address' }],
    name: 'whitelistedMakers',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: '', internalType: 'address', type: 'address' }],
    name: 'whitelistedResolvers',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'escrow',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'hashlock',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: true,
      },
      {
        name: 'taker',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'DstEscrowCreated',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      { name: 'paused', internalType: 'bool', type: 'bool', indexed: false },
    ],
    name: 'EmergencyPause',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'maker',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'MakerRemoved',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'maker',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'MakerWhitelisted',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'previousOwner',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'newOwner',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'OwnershipTransferred',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'escrow',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'hashlock',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: true,
      },
      {
        name: 'protocol',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'taker',
        internalType: 'address',
        type: 'address',
        indexed: false,
      },
      {
        name: 'amount',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'PostInteractionEscrowCreated',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'resolver',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'ResolverRemoved',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'resolver',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'ResolverWhitelisted',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'escrow',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'orderHash',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: true,
      },
      {
        name: 'maker',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'taker',
        internalType: 'address',
        type: 'address',
        indexed: false,
      },
      {
        name: 'amount',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'SrcEscrowCreated',
  },
  { type: 'error', inputs: [], name: 'FailedDeployment' },
  {
    type: 'error',
    inputs: [
      { name: 'balance', internalType: 'uint256', type: 'uint256' },
      { name: 'needed', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'InsufficientBalance',
  },
  { type: 'error', inputs: [], name: 'SafeTransferFromFailed' },
] as const

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// SimplifiedEscrowFactoryV2_3
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 */
export const simplifiedEscrowFactoryV2_3Abi = [
  {
    type: 'constructor',
    inputs: [
      { name: 'accessToken', internalType: 'contract IERC20', type: 'address' },
      { name: '_owner', internalType: 'address', type: 'address' },
      { name: 'rescueDelay', internalType: 'uint32', type: 'uint32' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'ESCROW_DST_IMPLEMENTATION',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'ESCROW_SRC_IMPLEMENTATION',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'maker', internalType: 'address', type: 'address' }],
    name: 'addMaker',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'resolver', internalType: 'address', type: 'address' }],
    name: 'addResolver',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      {
        name: 'immutables',
        internalType: 'struct IBaseEscrow.Immutables',
        type: 'tuple',
        components: [
          { name: 'orderHash', internalType: 'bytes32', type: 'bytes32' },
          { name: 'hashlock', internalType: 'bytes32', type: 'bytes32' },
          { name: 'maker', internalType: 'Address', type: 'uint256' },
          { name: 'taker', internalType: 'Address', type: 'uint256' },
          { name: 'token', internalType: 'Address', type: 'uint256' },
          { name: 'amount', internalType: 'uint256', type: 'uint256' },
          { name: 'safetyDeposit', internalType: 'uint256', type: 'uint256' },
          { name: 'timelocks', internalType: 'Timelocks', type: 'uint256' },
        ],
      },
      { name: 'isSrc', internalType: 'bool', type: 'bool' },
    ],
    name: 'addressOfEscrow',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [
      {
        name: 'immutables',
        internalType: 'struct IBaseEscrow.Immutables',
        type: 'tuple',
        components: [
          { name: 'orderHash', internalType: 'bytes32', type: 'bytes32' },
          { name: 'hashlock', internalType: 'bytes32', type: 'bytes32' },
          { name: 'maker', internalType: 'Address', type: 'uint256' },
          { name: 'taker', internalType: 'Address', type: 'uint256' },
          { name: 'token', internalType: 'Address', type: 'uint256' },
          { name: 'amount', internalType: 'uint256', type: 'uint256' },
          { name: 'safetyDeposit', internalType: 'uint256', type: 'uint256' },
          { name: 'timelocks', internalType: 'Timelocks', type: 'uint256' },
        ],
      },
    ],
    name: 'createDstEscrow',
    outputs: [{ name: 'escrow', internalType: 'address', type: 'address' }],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    inputs: [
      {
        name: 'immutables',
        internalType: 'struct IBaseEscrow.Immutables',
        type: 'tuple',
        components: [
          { name: 'orderHash', internalType: 'bytes32', type: 'bytes32' },
          { name: 'hashlock', internalType: 'bytes32', type: 'bytes32' },
          { name: 'maker', internalType: 'Address', type: 'uint256' },
          { name: 'taker', internalType: 'Address', type: 'uint256' },
          { name: 'token', internalType: 'Address', type: 'uint256' },
          { name: 'amount', internalType: 'uint256', type: 'uint256' },
          { name: 'safetyDeposit', internalType: 'uint256', type: 'uint256' },
          { name: 'timelocks', internalType: 'Timelocks', type: 'uint256' },
        ],
      },
      { name: 'maker', internalType: 'address', type: 'address' },
      { name: 'token', internalType: 'address', type: 'address' },
      { name: 'amount', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'createSrcEscrow',
    outputs: [{ name: 'escrow', internalType: 'address', type: 'address' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'emergencyPaused',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: '', internalType: 'bytes32', type: 'bytes32' }],
    name: 'escrows',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'resolver', internalType: 'address', type: 'address' }],
    name: 'isWhitelistedResolver',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'makerWhitelistEnabled',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'owner',
    outputs: [{ name: '', internalType: 'address', type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [],
    name: 'pause',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [
      {
        name: 'order',
        internalType: 'struct IOrderMixin.Order',
        type: 'tuple',
        components: [
          { name: 'salt', internalType: 'uint256', type: 'uint256' },
          { name: 'maker', internalType: 'Address', type: 'uint256' },
          { name: 'receiver', internalType: 'Address', type: 'uint256' },
          { name: 'makerAsset', internalType: 'Address', type: 'uint256' },
          { name: 'takerAsset', internalType: 'Address', type: 'uint256' },
          { name: 'makingAmount', internalType: 'uint256', type: 'uint256' },
          { name: 'takingAmount', internalType: 'uint256', type: 'uint256' },
          { name: 'makerTraits', internalType: 'MakerTraits', type: 'uint256' },
        ],
      },
      { name: '', internalType: 'bytes', type: 'bytes' },
      { name: 'orderHash', internalType: 'bytes32', type: 'bytes32' },
      { name: 'taker', internalType: 'address', type: 'address' },
      { name: 'makingAmount', internalType: 'uint256', type: 'uint256' },
      { name: '', internalType: 'uint256', type: 'uint256' },
      { name: '', internalType: 'uint256', type: 'uint256' },
      { name: 'extraData', internalType: 'bytes', type: 'bytes' },
    ],
    name: 'postInteraction',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'maker', internalType: 'address', type: 'address' }],
    name: 'removeMaker',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'resolver', internalType: 'address', type: 'address' }],
    name: 'removeResolver',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'resolverCount',
    outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: 'enabled', internalType: 'bool', type: 'bool' }],
    name: 'setMakerWhitelistEnabled',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: 'newOwner', internalType: 'address', type: 'address' }],
    name: 'transferOwnership',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [],
    name: 'unpause',
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    inputs: [{ name: '', internalType: 'address', type: 'address' }],
    name: 'whitelistedMakers',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    inputs: [{ name: '', internalType: 'address', type: 'address' }],
    name: 'whitelistedResolvers',
    outputs: [{ name: '', internalType: 'bool', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'escrow',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'hashlock',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: true,
      },
      {
        name: 'taker',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'DstEscrowCreated',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      { name: 'paused', internalType: 'bool', type: 'bool', indexed: false },
    ],
    name: 'EmergencyPause',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'maker',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'MakerRemoved',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'maker',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'MakerWhitelisted',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'previousOwner',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'newOwner',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'OwnershipTransferred',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'escrow',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'hashlock',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: true,
      },
      {
        name: 'protocol',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'taker',
        internalType: 'address',
        type: 'address',
        indexed: false,
      },
      {
        name: 'amount',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'PostInteractionEscrowCreated',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'resolver',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'ResolverRemoved',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'resolver',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
    ],
    name: 'ResolverWhitelisted',
  },
  {
    type: 'event',
    anonymous: false,
    inputs: [
      {
        name: 'escrow',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'orderHash',
        internalType: 'bytes32',
        type: 'bytes32',
        indexed: true,
      },
      {
        name: 'maker',
        internalType: 'address',
        type: 'address',
        indexed: true,
      },
      {
        name: 'taker',
        internalType: 'address',
        type: 'address',
        indexed: false,
      },
      {
        name: 'amount',
        internalType: 'uint256',
        type: 'uint256',
        indexed: false,
      },
    ],
    name: 'SrcEscrowCreated',
  },
  { type: 'error', inputs: [], name: 'FailedDeployment' },
  {
    type: 'error',
    inputs: [
      { name: 'balance', internalType: 'uint256', type: 'uint256' },
      { name: 'needed', internalType: 'uint256', type: 'uint256' },
    ],
    name: 'InsufficientBalance',
  },
  { type: 'error', inputs: [], name: 'SafeTransferFromFailed' },
] as const

/**
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 */
export const simplifiedEscrowFactoryV2_3Address = {
  10: '0xFbdCB5ac0C1381A64Ef1243bCeA0A1D899b0cA31',
  8453: '0xFbdCB5ac0C1381A64Ef1243bCeA0A1D899b0cA31',
} as const

/**
 * - [__View Contract on Op Mainnet Optimism Explorer__](https://optimistic.etherscan.io/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 * - [__View Contract on Base Basescan__](https://basescan.org/address/0xfBdCb5Ac0c1381A64Ef1243BCeA0A1d899b0Ca31)
 */
export const simplifiedEscrowFactoryV2_3Config = {
  address: simplifiedEscrowFactoryV2_3Address,
  abi: simplifiedEscrowFactoryV2_3Abi,
} as const
