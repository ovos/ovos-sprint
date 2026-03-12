# OVOS Sprint - Feature Roadmap

## High Priority

nothing

## Medium Priority

### Code Splitting & Bundle Optimization

- [ ] Implement route-based code splitting with React lazy/Suspense
- [ ] Split heavy libraries (Framer Motion, date libraries) into separate chunks
- [ ] Configure Vite rollupOptions for manual chunking
- [ ] Lazy load admin-only components for non-admin users
- [ ] Measure bundle size reduction and initial load time improvement

**Current State**: Single >700KB JavaScript bundle. Bundle size warning from Vite suggests splitting.

**Expected Impact**:

- Initial bundle: >700KB → ~350KB (main) + smaller route chunks
- Faster Time to Interactive (TTI)
- Better Lighthouse score
- Improved mobile performance

**Note**: Runtime performance is already optimized (Phase 4 complete). Code splitting improves initial page load, not runtime violations.

## Low Priority

### Feature: add a new toggle for abstract week view

- [ ] TBD

### Internationalization (i18n)

- [ ] Install and configure intlayer packages (`intlayer`, `react-intlayer`)
- [ ] Create `.content.ts` files for all pages and components
- [ ] Support German (de) and English (en) locales
- [ ] Replace hardcoded UI text with intlayer hooks
- [ ] Update date formatting in `lib/utils.ts` to use dynamic locale
- [ ] Configure intlayer build process
- [ ] Add language switcher component
- [ ] Use Tolgee for interactive localization

**Current State**: Application uses German locale (`de-AT`) for date formatting but all UI text is in English.
