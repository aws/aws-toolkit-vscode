/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable @typescript-eslint/brace-style */
import { DomBuilderObject, ExtendedHTMLElement } from '../../helper/dom'
import { generateUID } from '../../helper/guid'
import { MynahPortalNames } from '../../helper/static'

export const OVERLAY_MARGIN = 8
/**
 * The horizontal creation direction of the overlay
 */
export enum OverlayHorizontalDirection {
    /**
     * starts from the left edge of the reference element and opens to left
     */
    TO_LEFT = 'horizontal-direction-to-left',
    /**
     * starts from the right edge of the reference element and opens to left
     */
    END_TO_LEFT = 'horizontal-direction-from-end-to-left',
    /**
     * starts from the right edge of the reference element and opens to right
     */
    TO_RIGHT = 'horizontal-direction-to-right',
    /**
     * starts from the left edge of the reference element and opens to right
     */
    START_TO_RIGHT = 'horizontal-direction-from-start-to-right',
    /**
     * starts and opens at the center of the reference element
     */
    CENTER = 'horizontal-direction-at-center',
}

/**
 * The vertical creation direction of the overlay
 */
export enum OverlayVerticalDirection {
    /**
     * starts from the bottom edge of the reference element and opens to bottom
     */
    TO_BOTTOM = 'vertical-direction-to-bottom',
    /**
     * starts from the top edge of the reference element and opens to bottom
     */
    START_TO_BOTTOM = 'vertical-direction-from-start-to-bottom',
    /**
     * starts from the top edge of the reference element and opens to top
     */
    TO_TOP = 'vertical-direction-to-top',
    /**
     * starts from the bottom edge of the reference element and opens to top
     */
    END_TO_TOP = 'vertical-direction-from-end-to-top',
    /**
     * starts and opens at the center of the reference element
     */
    CENTER = 'vertical-direction-at-center',
}

export interface OverlayProps {
    referenceElement?: Element | ExtendedHTMLElement
    referencePoint?: { top: number; left: number }
    children: Array<HTMLElement | ExtendedHTMLElement | DomBuilderObject>
    horizontalDirection?: OverlayHorizontalDirection
    verticalDirection?: OverlayVerticalDirection
    dimOutside?: boolean
    closeOnOutsideClick?: boolean
    onClose?: () => void
}
export class Overlay {
    render: ExtendedHTMLElement
    private readonly container: ExtendedHTMLElement
    private readonly innerContainer: ExtendedHTMLElement
    private readonly guid = generateUID()
    private readonly onClose

    constructor(props: OverlayProps) {
        const horizontalDirection = props.horizontalDirection ?? OverlayHorizontalDirection.TO_RIGHT
        const verticalDirection = props.verticalDirection ?? OverlayVerticalDirection.START_TO_BOTTOM
        this.onClose = props.onClose
        const dimOutside = props.dimOutside !== false
        const closeOnOutsideClick = props.closeOnOutsideClick !== false

        const calculatedTop = this.getCalculatedTop(verticalDirection, props.referenceElement, props.referencePoint)
        const calculatedLeft = this.getCalculatedLeft(horizontalDirection, props.referenceElement, props.referencePoint)

        this.innerContainer = window.domBuilder.build({
            type: 'div',
            classNames: ['mynah-overlay-inner-container'],
            children: props.children,
        })

        this.container = window.domBuilder.build({
            type: 'div',
            classNames: ['mynah-overlay-container', horizontalDirection, verticalDirection],
            attributes: {
                style: `top: ${calculatedTop}px; left: ${calculatedLeft}px;`,
            },
            children: [this.innerContainer],
        })

        // this is a portal that goes over all the other items
        // to make it as an overlay item
        this.render = window.domBuilder.createPortal(
            `${MynahPortalNames.OVERLAY}-${this.guid}`,
            {
                type: 'div',
                attributes: { id: `mynah-overlay-${this.guid}` },
                classNames: [
                    'mynah-overlay',
                    ...(dimOutside ? ['mynah-overlay-dim-outside'] : []),
                    ...(closeOnOutsideClick ? ['mynah-overlay-close-on-outside-click'] : []),
                ],
                events: {
                    click: closeOnOutsideClick ? this.close : () => {},
                },
                children: [this.container],
            },
            'beforeend'
        )

        const containerRectangle = this.container.getBoundingClientRect()
        const winHeight = Math.max(document.documentElement.clientHeight ?? 0, window.innerHeight ?? 0)
        const winWidth = Math.max(document.documentElement.clientWidth ?? 0, window.innerWidth ?? 0)

        // if it will open at the center of the reference element or point
        // we only need the half of both measurements
        const comparingWidth =
            horizontalDirection === OverlayHorizontalDirection.CENTER
                ? containerRectangle.width / 2
                : containerRectangle.width
        const comparingHeight =
            verticalDirection === OverlayVerticalDirection.CENTER
                ? containerRectangle.height / 2
                : containerRectangle.height

        // if overlay will open to right or at center
        // we're checking if it exceeds from the right edge of the window
        if (
            horizontalDirection !== OverlayHorizontalDirection.TO_LEFT &&
            horizontalDirection !== OverlayHorizontalDirection.END_TO_LEFT &&
            comparingWidth + OVERLAY_MARGIN + calculatedLeft > winWidth
        ) {
            this.container.style.left =
                // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
                calculatedLeft - (comparingWidth + OVERLAY_MARGIN + calculatedLeft - winWidth) + 'px'
        }
        // else if the direction is selected as a one that goes to the left,
        // we need to check if it is exceeding from the left edge of the window
        else if (calculatedLeft + comparingWidth - containerRectangle.width < OVERLAY_MARGIN) {
            this.container.style.left =
                // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
                calculatedLeft + (OVERLAY_MARGIN - calculatedLeft + (comparingWidth - containerRectangle.width)) + 'px'
        }

        // if overlay will open to bottom or at center
        // we're checking if it exceeds from the bottom edge of the window
        if (
            verticalDirection !== OverlayVerticalDirection.TO_TOP &&
            verticalDirection !== OverlayVerticalDirection.END_TO_TOP &&
            comparingHeight + OVERLAY_MARGIN + calculatedTop > winHeight
        ) {
            this.container.style.top =
                // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
                calculatedTop - (comparingHeight + OVERLAY_MARGIN + calculatedTop - winHeight) + 'px'
        }
        // else if the direction is selected as a one that goes to the top,
        // we need to check if it is exceeding from the top edge of the window
        else if (calculatedTop + comparingHeight - containerRectangle.height < OVERLAY_MARGIN) {
            this.container.style.top =
                // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
                calculatedTop + (OVERLAY_MARGIN - calculatedTop + (comparingHeight - containerRectangle.height)) + 'px'
        }

        // we need to delay the class toggle
        // to avoid the skipping of the transition comes from css
        // for a known js-css relation problem
        setTimeout(() => {
            this.render.addClass('mynah-overlay-open')

            if (closeOnOutsideClick) {
                window.addEventListener('blur', this.windowBlurHandler.bind(this))
                window.addEventListener('resize', this.windowBlurHandler.bind(this))
            }
        }, 10)
    }

    close = (): void => {
        this.render.removeClass('mynah-overlay-open')
        // In this timeout, we're waiting the close animation to be ended
        setTimeout(() => {
            this.render.remove()
        }, 250)
        if (this.onClose !== undefined) {
            this.onClose()
        }
    }

    private readonly windowBlurHandler = (): void => {
        this.close()
        window.removeEventListener('blur', this.windowBlurHandler.bind(this))
        window.removeEventListener('resize', this.windowBlurHandler.bind(this))
    }

    private readonly getCalculatedLeft = (
        horizontalDirection: OverlayHorizontalDirection,
        referenceElement?: Element | ExtendedHTMLElement,
        referencePoint?: { top?: number; left: number }
    ): number => {
        const referenceRectangle =
            referenceElement !== undefined
                ? referenceElement.getBoundingClientRect()
                : referencePoint !== undefined
                ? { left: referencePoint.left, width: 0 }
                : { left: 0, width: 0 }

        switch (horizontalDirection.toString()) {
            case OverlayHorizontalDirection.TO_RIGHT:
                return referenceRectangle.left + referenceRectangle.width + OVERLAY_MARGIN
            case OverlayHorizontalDirection.START_TO_RIGHT:
                return referenceRectangle.left
            case OverlayHorizontalDirection.TO_LEFT:
                return referenceRectangle.left - OVERLAY_MARGIN
            case OverlayHorizontalDirection.END_TO_LEFT:
                return referenceRectangle.left + referenceRectangle.width
            case OverlayHorizontalDirection.CENTER:
                return referenceRectangle.left + referenceRectangle.width / 2
            default:
                return 0
        }
    }

    private readonly getCalculatedTop = (
        verticalDirection: OverlayVerticalDirection,
        referenceElement?: Element | ExtendedHTMLElement,
        referencePoint?: { top: number; left?: number }
    ): number => {
        const referenceRectangle =
            referenceElement !== undefined
                ? referenceElement.getBoundingClientRect()
                : referencePoint !== undefined
                ? { top: referencePoint.top, height: 0 }
                : { top: 0, height: 0 }

        switch (verticalDirection.toString()) {
            case OverlayVerticalDirection.TO_BOTTOM:
                return referenceRectangle.top + referenceRectangle.height + OVERLAY_MARGIN
            case OverlayVerticalDirection.START_TO_BOTTOM:
                return referenceRectangle.top
            case OverlayVerticalDirection.TO_TOP:
                return referenceRectangle.top - OVERLAY_MARGIN
            case OverlayVerticalDirection.END_TO_TOP:
                return referenceRectangle.top + referenceRectangle.height
            case OverlayVerticalDirection.CENTER:
                return referenceRectangle.top + referenceRectangle.height / 2
            default:
                return referenceRectangle.top
        }
    }

    public updateContent = (children: Array<string | DomBuilderObject | HTMLElement | ExtendedHTMLElement>): void => {
        this.innerContainer.update({ children })
    }
}
