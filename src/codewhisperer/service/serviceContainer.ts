/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { InlineDecorator } from './annotationUtils'
import { LineAnnotationController } from '../views/annotations/lineAnnotationController'
import { LineTracker } from '../views/annotations/lineTracker'
import { InlineCompletionService } from './inlineCompletionService'

export class Container {
    static #instance: Container | undefined

    static create(): Container {
        if (Container.#instance) {
            throw new Error('Container already exists')
        }

        Container.#instance = new Container()
        return Container.#instance
    }

    static get instance(): Container {
        return Container.#instance ?? Container.create()
    }

    readonly _lineTracker: LineTracker
    readonly _lineAnnotationController: LineAnnotationController

    constructor() {
        this._lineTracker = new LineTracker()
        this._lineAnnotationController = new LineAnnotationController(this._lineTracker)
    }
}
