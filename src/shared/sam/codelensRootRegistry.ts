/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path'
import { WatchedFiles } from '../watchedFiles'

/**
 * CodelensRootRegistry stores the locations of files that we consider as candidates for
 * the root of a potential Lambda handler. For example, any requirements.txt could be
 * in the root of a Python Lambda handler. We store these and update them as they are
 * updated so we do not have to rescan the file system.
 *
 * The type it stores it the basename of the path, so we can figure out if the candidate
 * is valid for each codelense
 */
export class CodelensRootRegistry extends WatchedFiles<string> {
    protected name: string = 'CodelensRootRegistry'
    protected async load(p: string): Promise<string> {
        return path.basename(p)
    }
}
