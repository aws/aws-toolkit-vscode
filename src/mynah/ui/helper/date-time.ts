/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export const getTimeDiff = (differenceInMs: number): string => {
    // get total seconds for the difference
    let delta = Math.abs(differenceInMs) / 1000

    // calculate (and subtract) whole days
    const days = Math.floor(delta / 86_400)
    delta -= days * 86_400

    // calculate (and subtract) whole hours
    const hours = Math.floor(delta / 3_600) % 24
    delta -= hours * 3_600

    // calculate (and subtract) whole minutes
    const minutes = Math.floor(delta / 60) % 60
    delta -= minutes * 60

    if (days + hours + minutes === 0) {
        return '1 min'
    } else {
        return `${days !== 0 ? `${days} days` : ''} ${hours !== 0 ? `${hours} hrs` : ''} ${
            minutes !== 0 ? `${minutes} mins` : ''
        }`
    }
}
