/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthUtil } from '../util/authUtil'

// TODO: uncomment
// import { ActiveStateController } from '../views/activeStateController'

// TODO: uncomment
// import { LineAnnotationController } from '../views/annotations/lineAnnotationController'
// import { LineTracker } from '../views/annotations/lineTracker'

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

    // TODO: uncomment
    // readonly lineTracker: LineTracker
    // readonly lineAnnotationController: LineAnnotationController
    // readonly activeStateController: ActiveStateController

    constructor(readonly auth: AuthUtil) {
        // TODO: uncomment
        // this.lineTracker = new LineTracker()
        // this.lineAnnotationController = new LineAnnotationController(this)
        // this.activeStateController = new ActiveStateController(this)
    }

    ready() {
        // TODO: uncomment
        // this.lineTracker.ready()
    }
}
