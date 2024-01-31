/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { InlineDecorator } from '../views/annotations/annotationUtils'
import { EditorGutterController } from '../views/annotations/editorGutterController'
import { LineAnnotationController } from '../views/annotations/lineAnnotationController'
import { LineTracker } from '../views/annotations/lineTracker'

export class Container {
    static #instance: Container | undefined

    static create(): Container {
        console.log('creating codewhisperer container')
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
    readonly _editorGutterController: EditorGutterController
    readonly _decorator: InlineDecorator

    constructor() {
        this._lineTracker = new LineTracker()
        this._decorator = new InlineDecorator()
        this._lineAnnotationController = new LineAnnotationController(this._lineTracker, this._decorator)
        this._editorGutterController = new EditorGutterController(this._lineTracker, this._decorator)
    }

    ready() {
        this._lineTracker.ready()
    }
}
