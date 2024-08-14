// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.go;

import com.goide.vgo.project.VgoDependencyImpl;
import com.intellij.openapi.util.io.FileUtil;
import com.intellij.util.PathUtil;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;

public class VgoDependencyInstance {
    public static VgoDependencyImpl getVgoDependencyImplInstance(@NotNull String importPath,
                                                                 @Nullable String version,
                                                                 @Nullable String goVersion,
                                                                 @Nullable String dirPath,
                                                                 @Nullable com.goide.vgo.project.VgoDependencyImpl replace, @Nullable Boolean indirect){
        return new VgoDependencyImpl(importPath, version, null, PathUtil.toSystemIndependentName(FileUtil.toCanonicalPath(dirPath)), replace, false,null,null,null,null);
    }
}
