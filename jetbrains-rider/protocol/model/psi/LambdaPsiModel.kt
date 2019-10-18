// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package protocol.model.psi

import com.jetbrains.rd.generator.nova.Ext
import com.jetbrains.rd.generator.nova.async
import com.jetbrains.rd.generator.nova.call
import com.jetbrains.rd.generator.nova.doc
import com.jetbrains.rd.generator.nova.field
import com.jetbrains.rd.generator.nova.PredefinedType.bool
import com.jetbrains.rd.generator.nova.PredefinedType.int
import com.jetbrains.rd.generator.nova.PredefinedType.string
import com.jetbrains.rider.model.nova.ide.SolutionModel

@Suppress("unused")
object LambdaPsiModel : Ext(SolutionModel.Solution) {

    private val HandlerExistRequest = structdef {
        field("className", string)
        field("methodName", string)
        field("projectId", int)
    }

    init {
        call("isHandlerExists", HandlerExistRequest, bool).async
            .doc("Check whether handler with specified name exists for a partucular project")
    }
}
