export function canReplyToReport(input: { role: string; userId: string; reportOwnerId: string }) {
  return ["owner", "admin", "moderator"].includes(input.role) || input.userId === input.reportOwnerId;
}

export function replyStatus(input: { role: string; currentStatus: string }) {
  const customerReply = !["owner", "admin", "moderator"].includes(input.role);
  return customerReply && ["resolved", "closed"].includes(input.currentStatus) ? "open" : input.currentStatus;
}
