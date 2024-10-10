/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import AdmZip from 'adm-zip'
import * as sinon from 'sinon'

type AdmZipMethod = 'addLocalFile'
type AdmZipMethodMap = Record<AdmZipMethod, sinon.SinonSpy<any, any>>

export class AdmZipSpy {
    private methods: AdmZipMethodMap
    public constructor(instance: AdmZip) {
        this.methods = {
            addLocalFile: sinon.spy(instance, 'addLocalFile'),
        }
    }

    public get addLocalFile(): sinon.SinonSpy<any, any> {
        return this.methods.addLocalFile
    }
}
