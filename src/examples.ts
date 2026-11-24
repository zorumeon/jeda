// Synthetic example messages shown as chips on the Check page. They are also covered by a regression test in
// src/secret-guard.test.ts so that none of them can be blocked by the local secret guard.
// Synthetic recovery phrase used by the judge tour and the testing instructions. It is not a real wallet; a regression
// test in src/secret-guard.test.ts confirms the local secret guard blocks it.
export const judgeSeedPhrase = 'apple river stone cloud maple tiger lemon ocean pencil garden window silver'
export const examples: { label: string; kind: 'scam' | 'benign'; text: string }[] = [
  { label: 'Claim your airdrop', kind: 'scam', text: 'FINAL NOTICE: You have 12 minutes to claim your unclaimed token allocation. Connect your wallet and approve the verification transaction at https://claim-rewards.example.' },
  { label: 'Wallet support DM', kind: 'scam', text: 'Hi, I am official wallet support. Your account is frozen. Send your recovery phrase in this private chat and I can restore access.' },
  { label: 'Unlimited approval request', kind: 'scam', text: 'To stake your NFT, approve unlimited spending for this token in your wallet. The contract is safe, no need to review the permissions.' },
  { label: 'Recovery service offer', kind: 'scam', text: 'We recovered your lost crypto. Pay a refundable 0.2 ETH gas deposit first and our recovery agent will return your funds today.' },
  { label: 'Community giveaway', kind: 'scam', text: 'Send 0.1 ETH to verify your wallet and receive 1 ETH back. Only the first 50 community members qualify. Send now!' },
  { label: 'Normal event invite', kind: 'benign', text: 'Our community call is Thursday at 17:00 UTC. The agenda and public meeting link are pinned in the project website. No wallet connection is needed.' },
  { label: 'Routine approval', kind: 'benign', text: 'I am reviewing the token allowance in my wallet settings. I will set a limited amount and verify the contract address from the project documentation first.' },
]
