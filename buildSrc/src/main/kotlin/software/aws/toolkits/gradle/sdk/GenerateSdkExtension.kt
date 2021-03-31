// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.gradle.sdk

import org.gradle.api.file.Directory
import org.gradle.api.file.DirectoryProperty
import org.gradle.api.model.ObjectFactory
import org.gradle.api.provider.Provider

open class GenerateSdkExtension(objects: ObjectFactory) {
    val c2jFolder: DirectoryProperty = objects.directoryProperty()

    val outputDir: DirectoryProperty = objects.directoryProperty()

    fun srcDir(): Provider<Directory> = outputDir.dir("src")
    fun testDir(): Provider<Directory> = outputDir.dir("tst")
}
