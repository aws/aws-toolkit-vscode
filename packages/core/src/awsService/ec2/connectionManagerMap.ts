/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getLogger } from '../../shared/logger/logger'
import { Ec2Connecter } from './model'

export class Ec2ConnecterMap extends Map<string, Ec2Connecter> {
    private static warnSize: number = 25

    public getOrInit(regionCode: string) {
        return this.has(regionCode) ? this.get(regionCode)! : this.initManager(regionCode)
    }

    private initManager(regionCode: string): Ec2Connecter {
        if (this.size >= Ec2ConnecterMap.warnSize) {
            getLogger().warn(
                `Connection manager exceeded threshold of ${Ec2ConnecterMap.warnSize} with ${this.size} active connections`
            )
        }
        const newConnectionManager = new Ec2Connecter(regionCode)
        this.set(regionCode, newConnectionManager)
        return newConnectionManager
    }
}
