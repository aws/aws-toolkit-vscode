/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export const extractCodeBlockLanguage = (message: string) => {
    // This fulfills both the cases of unit test generation(java, python) and general use case(Non java and Non python) languages.
    const codeBlockStart = message.indexOf('```')
    if (codeBlockStart === -1) {
        return 'plaintext'
    }

    const languageStart = codeBlockStart + 3
    const languageEnd = message.indexOf('\n', languageStart)

    if (languageEnd === -1) {
        return 'plaintext'
    }

    const language = message.substring(languageStart, languageEnd).trim()
    return language !== '' ? language : 'plaintext'
}
