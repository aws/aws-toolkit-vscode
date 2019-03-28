/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { safeGet } from '../../shared/extensionUtilities'

describe('extensionUtilities', () => {
    describe('safeGet', () => {

        class Blah {
            public someProp?: string

            public constructor(someProp?: string) {
                this.someProp = someProp
            }
        }

        it('can access sub-property', () => {
            assert.strictEqual(safeGet(new Blah('hello!'), x => x.someProp), 'hello!')
            assert.strictEqual(safeGet(new Blah(), x => x.someProp), undefined)
            assert.strictEqual(safeGet(undefined as Blah | undefined, x => x.someProp), undefined)
        })
    })
})
