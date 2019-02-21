/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

export const getPropAs = <T>(obj: any, key: string) => {
    return (obj as any as {
        [key: string]: T
    })[key]
}
