// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.icons

import com.intellij.icons.AllIcons
import com.intellij.openapi.util.IconLoader
import com.intellij.openapi.util.IconPathPatcher
import icons.AwsIcons
import javax.swing.Icon

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

        private fun path(icon: Icon): String {
            val iconToProcess = icon as? IconLoader.CachedImageIcon
                ?: throw RuntimeException("${icon.javaClass.simpleName} should be CachedImageIcon")

            return iconToProcess.originalPath
                ?: throw RuntimeException("Unable to get original path for icon: ${iconToProcess.javaClass.simpleName}")
        }
    }

    override fun patchPath(path: String, classLoader: ClassLoader?): String? = myIconsOverrideMap[path]

    override fun getContextClassLoader(path: String, originalClassLoader: ClassLoader?): ClassLoader? =
        if (myIconsOverrideMap.containsKey(path)) javaClass.classLoader
        else originalClassLoader

    private val myIconsOverrideMap = mapOf(
        "/resharper/LambdaRunMarkers/Lambda.svg" to path(AwsIcons.Resources.LAMBDA_FUNCTION),
        "/resharper/LambdaRunMarkers/CreateNew.svg" to path(AllIcons.Actions.New)
    )
}
