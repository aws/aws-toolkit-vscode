/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs'

const OUTPUT_SPACING: number = 4

interface LocalizationElement {
    messages: string[]
    keys: string[]
}

const nlsdata = JSON.parse(fs.readFileSync('./dist/nls.metadata.json').toString())
const outdata = JSON.parse(fs.readFileSync('package.nls.json').toString())

// Reads the strings extracted by the nls webpack loader, then overwrites our package.nls.json data
for (const fileKey in nlsdata) {
    const element: LocalizationElement = nlsdata[fileKey]
    element.keys.forEach((key, index) => {
        outdata[key] = element.messages[index]
    })
}

fs.writeFileSync('package.nls.json', JSON.stringify(outdata, undefined, OUTPUT_SPACING))
