function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') {
    return false
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const prototype = Object.getPrototypeOf(value)

  return prototype === Object.prototype || prototype === null
}

export function deepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true
  }

  if (left === null || right === null) {
    return left === right
  }

  if (left instanceof Date && right instanceof Date) {
    return left.getTime() === right.getTime()
  }

  if (left instanceof RegExp && right instanceof RegExp) {
    return left.source === right.source && left.flags === right.flags
  }

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return false
    }

    for (let index = 0; index < left.length; index += 1) {
      if (!deepEqual(left[index], right[index])) {
        return false
      }
    }

    return true
  }

  if (isPlainObject(left) || isPlainObject(right)) {
    if (!isPlainObject(left) || !isPlainObject(right)) {
      return false
    }

    const leftEntries = Object.entries(left).filter(([, value]) => value !== undefined)
    const rightEntries = Object.entries(right).filter(([, value]) => value !== undefined)

    if (leftEntries.length !== rightEntries.length) {
      return false
    }

    const sortedLeft = leftEntries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    const sortedRight = rightEntries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))

    for (let index = 0; index < sortedLeft.length; index += 1) {
      const [leftKey, leftValue] = sortedLeft[index]
      const [rightKey, rightValue] = sortedRight[index]

      if (leftKey !== rightKey || !deepEqual(leftValue, rightValue)) {
        return false
      }
    }

    return true
  }

  return false
}
