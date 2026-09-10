# Comic Diary Design System

## Purpose

This document describes the component architecture rules for Comic
Diary.

The goal is to keep visual consistency, theme support, and predictable
boundaries between UI and application logic.

------------------------------------------------------------------------

# Layers

    theme
      ↓
    ui
      ↓
    domain
      ↓
    app

# Theme Layer

Location:

    src/shared/theme

Responsibilities:

-   semantic color tokens;
-   spacing;
-   typography hooks;
-   shape;
-   elevation.

Components should consume semantic variables.

Good: `var(--primary)`, `var(--surface)`, `var(--foreground)`

Avoid hardcoded colors.

Themes override tokens, not components.

# UI Layer

Location:

    src/shared/components/ui

Examples:

-   Button
-   Card
-   Badge
-   Section

UI components provide reusable visual primitives and must not contain
business logic.

# Domain Layer

Location:

    src/shared/components/domain

Examples:

-   ChapterCard
-   ComicCard

Domain components represent application objects and combine UI
primitives.

# Client Boundaries

Interactive behavior should be isolated.

Pattern:

    Domain Component
            |
    Client Action Component
            |
    router / API / state

Example:

    ChapterCard
          |
    ChapterCardAction

# Application Layer

Location:

    src/app

Responsibilities:

-   pages;
-   routing;
-   data loading;
-   permissions;
-   workflows.

# Current Principles

1.  Components consume semantic tokens.
2.  Visual primitives do not know business rules.
3.  Domain objects are separated from interaction logic.
4.  Client code should exist only where needed.
5.  New components should follow existing layers.
