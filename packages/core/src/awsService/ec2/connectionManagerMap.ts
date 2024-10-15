/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getLogger } from '../../shared'
import { Ec2ConnectionManager } from './model'

export class Ec2ConnectionManagerMap extends Map<string, Ec2ConnectionManager> {
    private static warnSize: number = 25

    public getOrInit(regionCode: string) {
        return this.has(regionCode) ? this.get(regionCode)! : this.initiateManager(regionCode)
    }

    private initiateManager(regionCode: string): Ec2ConnectionManager {
        if (this.size >= Ec2ConnectionManagerMap.warnSize) {
            getLogger().warn(
                `Connection manager exceeded threshold of ${Ec2ConnectionManagerMap.warnSize} with ${this.size} active connections`
            )
        }
        const newConnectionManager = new Ec2ConnectionManager(regionCode)
        this.set(regionCode, newConnectionManager)
        return newConnectionManager
    }
}
