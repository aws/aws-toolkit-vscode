// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.icons

import com.intellij.openapi.util.IconLoader
import com.intellij.openapi.util.IconPathPatcher

/**
 * Icons Patcher for icons set from Rider backend (R#).
 * Rider backend do not have access to fronted icons (e.g. LambdaFunction.svg, new.svg). To share an existing frontend icons
 * and reuse them instead of creating a duplicate set on a backend, we can replace a fake backend icon with any frontend icon by path.
 * This class is used to set frontend icons for gutter mark popup menu that is fully composed on Rider backend.
 */
internal class RiderAwsIconsPatcher : IconPathPatcher() {

    companion object {
        fun install() = myInstallPatcher

        private val myInstallPatcher: Unit by lazy {
            IconLoader.installPathPatcher(RiderAwsIconsPatcher())
        }
    }

    override fun patchPath(path: String, classLoader: ClassLoader?): String? = myIconsOverrideMap[path]

    override fun getContextClassLoader(path: String, originalClassLoader: ClassLoader?): ClassLoader? =
        if (myIconsOverrideMap.containsKey(path)) {
            javaClass.classLoader
        } else {
            originalClassLoader
        }

    private val myIconsOverrideMap = mapOf(
        "/resharper/LambdaRunMarkers/Lambda.svg" to "AwsIcons.Resources.LAMBDA_FUNCTION",
        "/resharper/LambdaRunMarkers/CreateNew.svg" to "AllIcons.Actions.New"
    )
}
