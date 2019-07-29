// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.explorer.nodes

/**
 * Marker interface to indicate that a node will always have children. This prevents the tree from having to query for
 * children before it will show the expansion icon.
 */
interface AwsNodeAlwaysExpandable