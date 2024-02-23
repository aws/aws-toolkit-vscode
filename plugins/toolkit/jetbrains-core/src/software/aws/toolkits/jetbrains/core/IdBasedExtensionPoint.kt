// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.core

import com.intellij.openapi.extensions.CustomLoadingExtensionPointBean
import com.intellij.util.KeyedLazyInstance
import com.intellij.util.xmlb.annotations.Attribute

/**
 * Extension point that is used to tie multiple extension points together by a common ID.
 *
 * For example, if you have a "parent" extension point that defines a new ID, i.e Lambda runtime.
 * "Children" extension points that support it can then use the same ID to correlate each other,
 * i.e Lambda building, Lambda handler can be looked up using the same ID as defined by the Runtime parent EP.
 *
 * Additional attributes can be defined on the EP by extending this class.
 */
open class IdBasedExtensionPoint<T> : CustomLoadingExtensionPointBean<T>(), KeyedLazyInstance<T> {
    @Attribute("id")
    lateinit var id: String

    @Attribute("implementationClass")
    lateinit var implementationClass: String

    override fun getImplementationClassName(): String = implementationClass

    override fun getKey(): String = id
}
