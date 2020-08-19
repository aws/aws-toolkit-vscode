/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { JSONDocument, TextDocument } from 'amazon-states-language-service'
import { getLanguageService } from '../../../../../src/stepFunctions/asl/asl-yaml-languageservice'

export function toDocument(text: string): { textDoc: TextDocument; jsonDoc: JSONDocument } {
    const textDoc = TextDocument.create('foo://bar/file.asl', 'json', 0, text)

    const ls = getLanguageService({})
    // tslint:disable-next-line: no-inferred-empty-object-type
    const jsonDoc = ls.parseJSONDocument(textDoc) as JSONDocument

    return { textDoc, jsonDoc }
}
