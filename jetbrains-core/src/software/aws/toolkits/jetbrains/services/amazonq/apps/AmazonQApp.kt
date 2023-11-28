// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonq.apps

import com.intellij.openapi.Disposable

/**
 * Base interface for the entry point for "apps" that are built using AmazonQ.
 *
 * Apps should implement this interface, and then register the implementing class in plugin.xml as an extension:
 *
 * <extensions defaultExtensionNs="aws.toolkit.amazonq">
 *     <app implementation="software.aws.toolkits.jetbrains.services.your.app.class" />
 * </extensions>
 */
interface AmazonQApp : Disposable {

    /**
     * The types of tabs supported by this app. Messages will only be received by the app if they have a tabType that is contained in this list.
     */
    val tabTypes: List<String>

    /**
     * This initializer function is called when the tool window is being setup. The app is passed an instance of [AmazonQAppInitContext], which contains the
     * connections needed to communicate with the Amazon Q UI.
     */
    fun init(context: AmazonQAppInitContext)
}
