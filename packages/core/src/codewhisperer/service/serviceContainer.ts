/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthUtil } from '../util/authUtil'
import { ActiveStateController } from '../views/activeStateController'
import { LineTracker } from '../tracker/lineTracker'

export class Container {
    static #instance: Container | undefined

    static create(authProvider: AuthUtil): Container {
        if (Container.#instance) {
            throw new Error('Container already exists')
        }

        Container.#instance = new Container(authProvider)
        return Container.#instance
    }

    static get instance(): Container {
        return Container.#instance ?? Container.create(AuthUtil.instance)
    }

    readonly lineTracker: LineTracker
    readonly activeStateController: ActiveStateController

    constructor(readonly auth: AuthUtil) {
        this.lineTracker = new LineTracker()
        this.activeStateController = new ActiveStateController(this)
    }
}
