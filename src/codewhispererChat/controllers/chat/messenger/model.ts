/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

interface ChatException {
    errorMessage: string | undefined
    sessionID: string | undefined
    statusCode: string | undefined
}
