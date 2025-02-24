/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 *
 */

import { ToolkitError } from '../shared/errors'

export class CommonAmazonQContentLengthError extends ToolkitError {
    constructor(message: string) {
        super(message, { code: 'CommonAmazonQContentLengthError' })
    }
}
