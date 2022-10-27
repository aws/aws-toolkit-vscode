// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package base

import com.jetbrains.rider.test.scriptingApi.setUpCustomToolset

// FIX_WHEN_MIN_IS_221: signature changed in 221
fun setUpCustomToolset(path: String, host: com.jetbrains.rdclient.protocol.IProtocolHost) =
    setUpCustomToolset(path, host)
