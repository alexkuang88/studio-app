// =====================================================
// 防呆校验函数
// =====================================================

/**
 * 校验：end_amount 不能小于 start_amount
 */
export function validateAmountRange(
  startAmount: number,
  endAmount: number
): { valid: boolean; message: string } {
  if (endAmount < startAmount) {
    return {
      valid: false,
      message: "结束余额不能小于开始余额 / Le solde final ne peut pas être inférieur au solde initial",
    };
  }
  return { valid: true, message: "" };
}

/**
 * 校验：end_time 必须晚于 start_time
 */
export function validateTimeRange(
  startTime: string | Date,
  endTime: string | Date
): { valid: boolean; message: string } {
  if (new Date(endTime) <= new Date(startTime)) {
    return {
      valid: false,
      message: "结束时间必须晚于开始时间 / L'heure de fin doit être postérieure à l'heure de début",
    };
  }
  return { valid: true, message: "" };
}

/**
 * 校验：订单编号唯一
 */
export function validateOrderCode(
  code: string
): { valid: boolean; message: string } {
  if (!code || code.trim().length === 0) {
    return {
      valid: false,
      message: "订单编号不能为空 / Le code de commande ne peut pas être vide",
    };
  }
  if (!/^[A-Za-z0-9_-]+$/.test(code)) {
    return {
      valid: false,
      message: "订单编号只能包含字母、数字、下划线和连字符",
    };
  }
  return { valid: true, message: "" };
}

/**
 * 校验：员工编号唯一
 */
export function validateEmployeeCode(
  code: string
): { valid: boolean; message: string } {
  if (!code || code.trim().length === 0) {
    return {
      valid: false,
      message: "员工编号不能为空 / Le code employé ne peut pas être vide",
    };
  }
  return { valid: true, message: "" };
}

/**
 * 校验：设备编号唯一
 */
export function validateMachineCode(
  code: string
): { valid: boolean; message: string } {
  if (!code || code.trim().length === 0) {
    return {
      valid: false,
      message: "设备编号不能为空 / Le code machine ne peut pas être vide",
    };
  }
  return { valid: true, message: "" };
}

/**
 * 校验：作废必须填写原因
 */
export function validateVoidReason(
  reason: string
): { valid: boolean; message: string } {
  if (!reason || reason.trim().length === 0) {
    return {
      valid: false,
      message: "作废原因不能为空 / La raison d'annulation ne peut pas être vide",
    };
  }
  return { valid: true, message: "" };
}

/**
 * 校验：强制完成必须填写原因
 */
export function validateForceCompleteReason(
  reason: string
): { valid: boolean; message: string } {
  if (!reason || reason.trim().length === 0) {
    return {
      valid: false,
      message: "强制完成原因不能为空 / La raison de complétion forcée ne peut pas être vide",
    };
  }
  return { valid: true, message: "" };
}

/**
 * 校验：解锁工资必须填写原因
 */
export function validateUnlockReason(
  reason: string
): { valid: boolean; message: string } {
  if (!reason || reason.trim().length === 0) {
    return {
      valid: false,
      message: "解锁原因不能为空 / La raison de déverrouillage ne peut pas être vide",
    };
  }
  return { valid: true, message: "" };
}
