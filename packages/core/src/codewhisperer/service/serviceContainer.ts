/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthUtil } from '../util/authUtil'
import { ActiveStateController } from '../views/activeStateController'
import { LineTracker } from '../tracker/lineTracker'

/**
 * Container for CodeWhisperer sub-components
 * Please utilize this container class as the bridge to access other components to avoid create singleton objects when it's not necessary.
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

    readonly _lineTracker: LineTracker
    readonly _editorGutterController: ActiveStateController

    protected constructor(readonly auth: AuthUtil) {
        this._lineTracker = new LineTracker()
        this._editorGutterController = new ActiveStateController(this)
    }

    ready() {
        this._lineTracker.ready()
    }
}
