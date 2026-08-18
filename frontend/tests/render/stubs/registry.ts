import type { Component } from 'svelte';

import BrightImage from './BrightImage.svelte';
import Card from './Card.svelte';
import Fits from './Fits.svelte';
import GradientFill from './GradientFill.svelte';
import GradientScrim from './GradientScrim.svelte';
import Grouped from './Grouped.svelte';
import LitPanel from './LitPanel.svelte';
import ModernColour from './ModernColour.svelte';
import Outlined from './Outlined.svelte';
import Overflows from './Overflows.svelte';
import RegionFill from './RegionFill.svelte';
import Scrim from './Scrim.svelte';
import TypeScale from './TypeScale.svelte';

/**
 * The registry the render tier substitutes for the product's empty one. Each stub is a shape the
 * render obligations are read against — a box that fits, one that overflows, the type scale, the
 * legal grouping vocabulary, and the emitting surfaces that must be reported as above the ceiling.
 */
export const modules: Record<string, Component> = {
  fits: Fits,
  overflows: Overflows,
  'type-scale': TypeScale,
  grouped: Grouped,
  'bright-image': BrightImage,

  // Seeds. A fixture placing one of these is asserting that the emission scan reports it.
  'lit-panel': LitPanel,
  card: Card,
  'region-fill': RegionFill,
  outlined: Outlined,
  scrim: Scrim,
  'gradient-fill': GradientFill,
  'gradient-scrim': GradientScrim,
  'modern-colour': ModernColour,
};
