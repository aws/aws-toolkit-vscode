/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthUtil } from '../util/authUtil'
import { ActiveStateUIController } from '../views/activeStateController'
import { LineTracker } from '../tracker/lineTracker'

/**
 * Please utilize this container class as the bridge to access other components to avoid creating too many singleton objects when not needed.
 * Example:
 * class SubComponent {
 *      constructor(private readonly container: Container) {}
 *
 *      public doSomething() {
 *          const isConnected = this.container.authProvider.isConnected()
 *          this.anotherComponent.update(isConnected)
 *      }
 * }
 */
export class Container {
    static #instance: Container | undefined

    static get instance(): Container {
        return (Container.#instance ??= new Container(AuthUtil.instance))
    }

    readonly lineTracker: LineTracker
    readonly activeStateController: ActiveStateUIController

    protected constructor(readonly auth: AuthUtil) {
        this.lineTracker = new LineTracker()
        this.activeStateController = new ActiveStateUIController(this)
    }
}
