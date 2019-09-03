// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package protocol.model

import com.jetbrains.rd.generator.nova.Ext
import com.jetbrains.rd.generator.nova.field
import com.jetbrains.rd.generator.nova.sink
import com.jetbrains.rd.generator.nova.PredefinedType.string
import com.jetbrains.rider.model.nova.ide.SolutionModel

@Suppress("unused")
object LambdaModel : Ext(SolutionModel.Solution) {

    private val LambdaRequest = structdef {
        field("methodName", string)
        field("handler", string)
    }

    init {
        sink("runLambda", LambdaRequest)
        sink("debugLambda", LambdaRequest)
        sink("createNewLambda", LambdaRequest)
    }
}
