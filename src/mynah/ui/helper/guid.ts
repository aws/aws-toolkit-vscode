/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export const generateUID = (): string => {
    const firstPart: number = (Math.random() * 46656) | 0
    const secondPart: number = (Math.random() * 46656) | 0
    return `000${firstPart.toString(36)}`.slice(-3) + `000${secondPart.toString(36)}`.slice(-3)
}
