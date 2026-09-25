import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { sectionLink } from '../landing.config';
import { scrollToSection } from '../sectionScroll';

interface SectionLinkProps extends Omit<React.ComponentProps<typeof Link>, 'to'> {
  /** Id of the landing section to jump to. */
  sectionId: string;
}

/**
 * Link to a landing section that works from any page. The router ignores a click on the link
 * the page is already at (same path and hash), so in that one case the link scrolls itself;
 * every other navigation is left to the router and LandingPage's hash effect.
 */
const SectionLink: React.FC<SectionLinkProps> = ({ sectionId, onClick, ...rest }) => {
  const { pathname, hash } = useLocation();
  return (
    <Link
      to={sectionLink(sectionId)}
      onClick={(event) => {
        onClick?.(event);
        if (pathname === '/' && hash === `#${sectionId}`) scrollToSection(sectionId);
      }}
      {...rest}
    />
  );
};

export default SectionLink;
