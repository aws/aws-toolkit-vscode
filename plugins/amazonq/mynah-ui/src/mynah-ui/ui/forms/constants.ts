/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export const enum FormButtonIds {
  CodeTransformInputConfirm = 'codetransform-input-confirm',
  CodeTransformInputCancel = 'codetransform-input-cancel',
  OpenMvnBuild = 'open_mvn_build',
  StopTransform = 'stop_transform',
  OpenTransformationHub = 'open_transformation_hub',
  CodeTransformViewDiff = 'view_diff',
  CodeTransformViewSummary = 'view_summary',
  ConfirmHilSelection = 'confirm_hil_selection',
  RejectHilSelection = 'reject_hil_selection',
  OpenDependencyErrorPom = "open_dependency_error_pom",
}

export const isFormButtonCodeTransform = (id: string): boolean => {
  return (
    id === FormButtonIds.CodeTransformInputConfirm ||
    id === FormButtonIds.CodeTransformInputCancel ||
    id === FormButtonIds.CodeTransformViewDiff ||
    id === FormButtonIds.CodeTransformViewSummary ||
    id === FormButtonIds.OpenMvnBuild ||
    id === FormButtonIds.StopTransform ||
    id === FormButtonIds.OpenTransformationHub ||
    id === FormButtonIds.ConfirmHilSelection ||
    id === FormButtonIds.RejectHilSelection ||
    id === FormButtonIds.OpenDependencyErrorPom
  )
}
