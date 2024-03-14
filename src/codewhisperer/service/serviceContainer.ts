/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthUtil } from '../util/authUtil'
import { activeStateController } from '../views/annotations/activeStateController'
import { LineAnnotationController } from '../views/annotations/lineAnnotationController'
import { LineTracker } from '../views/annotations/lineTracker'

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

    readonly _lineTracker: LineTracker
    readonly _lineAnnotationController: LineAnnotationController
    readonly _editorGutterController: activeStateController

    constructor(readonly auth: AuthUtil) {
        this._lineTracker = new LineTracker()
        this._lineAnnotationController = new LineAnnotationController(this)
        this._editorGutterController = new activeStateController(this)
    }

    ready() {
        this._lineTracker.ready()
    }
}
