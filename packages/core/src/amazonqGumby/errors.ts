/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 *
 */

import { ToolkitError } from '../shared/errors'

export class JavaHomeNotSetError extends ToolkitError {
    constructor() {
        super('Java Home Is Not Set', { code: 'JavaHomeNotFound' })
    }
}

export class NoOpenProjectsError extends ToolkitError {
    constructor() {
        super('No Java projects found since no projects are open', { code: 'NoOpenProjects' })
    }
}

export class NoJavaProjectsFoundError extends ToolkitError {
    constructor() {
        super('No Java projects found', { code: 'CouldNotFindJavaProject' })
    }
}

export class NoMavenJavaProjectsFoundError extends ToolkitError {
    constructor() {
        super('No valid Maven build file found', { code: 'CouldNotFindPomXml' })
    }
}
