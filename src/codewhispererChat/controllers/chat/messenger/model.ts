/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

interface ChatException {
    readonly errorMessage: string | undefined
    readonly sessionID: string | undefined
    readonly statusCode: string | undefined
}
