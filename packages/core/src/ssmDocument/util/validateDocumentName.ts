/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { localize } from '../../shared/utilities/vsCodeUtils'

export function validateDocumentName(name: string): string | undefined {
    {
        if (!name) {
            return localize(
                'AWS.ssmDocument.publishWizard.ssmDocumentName.validation.empty',
                'Document name cannot be empty'
            )
        }

        if (name.startsWith('AWS-') || name.startsWith('Amazon')) {
            return localize(
                'AWS.ssmDocument.publishWizard.ssmDocumentName.validation.reservedWord',
                'Document name cannot start with Amazon or AWS-'
            )
        }

        const docNameRegex: RegExp = /^[\_a-zA-Z0-9\-.]+$/
        if (!docNameRegex.test(name)) {
            return localize(
                'AWS.ssmDocument.publishWizard.ssmDocumentName.validation.invalidCharacter',
                'Document name contains invalid characters, only a-z, A-Z, 0-9, and _, -, and . are allowed'
            )
        }

        if (name.length < 3 || name.length > 128) {
            return localize(
                'AWS.ssmDocument.publishWizard.ssmDocumentName.validation.invalidLength',
                'Document name length must be between 3 and 128 characters'
            )
        }

        return undefined
    }
}
