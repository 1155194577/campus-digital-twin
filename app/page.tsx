import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUpRight, Box, FlaskConical, Globe2, Phone, Share2 } from "lucide-react";
import LegacyExplorerLink from "@/components/legacy-explorer-link";
import styles from "./showcase.module.css";

export const metadata: Metadata = {
  title: "meshPotato | 3D engineering and spatial technology",
  description: "Explore meshPotato’s work in 3D modeling, fabrication, topology optimization, sustainable materials, GIS and digital twins.",
  icons: { icon: "/showcase/potato.svg" },
};

const capabilities = [
  {
    title: "3D design & fabrication",
    description: "Reconstruct geometry from photos and scans, then prepare it for 3D printing.",
    specialties: ["3D modeling", "3D printing"],
    icon: Box,
  },
  {
    title: "Engineering R&D",
    description: "Optimize parts for their loads and constraints, and investigate more resource-efficient materials.",
    specialties: ["Topology optimization", "Sustainable material development"],
    icon: FlaskConical,
  },
  {
    title: "Geospatial systems",
    description: "Turn geographic data into interactive digital twins and physical maps.",
    specialties: ["GIS data", "Digital twins"],
    icon: Globe2,
  },
];

const projects = [
  {
    category: "3D modeling · Fabrication",
    title: "From scan to print-ready model",
    description: (
      <>
        Our <a href="https://github.com/1155194577/lidar-scanner-ios">LiDAR Scanner for iOS</a> captures rooms and objects in 3D and exports scans as STL.
        {" "}The print workflow turns photos or scans into scaled, repaired STLs for 3D printing.
      </>
    ),
    href: "https://github.com/1155194577/3d-print",
    action: "View the print workflow",
  },
  {
    category: "GIS · Digital twins",
    title: "Campus Atlas",
    description: "Explore buildings and map layers at Hong Kong Science Park and CUHK in an interactive 3D geographic snapshot.",
    image: "/showcase/campus-map.webp",
    imageLabel: "CUHK digital twin render",
    href: "/explore",
    action: "Open Campus Atlas",
  },
  {
    category: "GIS · 3D printing",
    title: "Hong Kong tactile maps",
    description: "Convert mapped streets, buildings and open spaces into raised-relief models that can be explored by touch.",
    image: "/showcase/hkstp-tactile.webp",
    imageLabel: "Tactile STL render",
    href: "https://github.com/1155194577/py-touch-mapper-hk",
    action: "View the tactile map tool",
  },
];

const goals = [
  {
    number: 9,
    title: "Industry, Innovation and Infrastructure",
    description: "Research better ways to model, optimize and fabricate parts.",
    href: "https://sdgs.un.org/goals/goal9",
  },
  {
    number: 11,
    title: "Sustainable Cities and Communities",
    description: "Explore more inclusive ways to understand places, including tactile maps.",
    href: "https://sdgs.un.org/goals/goal11",
  },
  {
    number: 12,
    title: "Responsible Consumption and Production",
    description: "Investigate material choices and designs that use resources more efficiently.",
    href: "https://sdgs.un.org/goals/goal12",
  },
];

function Wordmark() {
  return <span className={styles.wordmark}><Image src="/showcase/potato.svg" alt="" width={34} height={34} unoptimized />meshPotato</span>;
}

export default function Home() {
  return (
    <div className={styles.site} id="top">
      <LegacyExplorerLink />
      <a className={styles.skipLink} href="#main">Skip to content</a>
      <header className={styles.header}>
        <div className={styles.container}>
          <div className={styles.headerInner}>
            <a href="#top" aria-label="meshPotato home"><Wordmark /></a>
            <nav className={styles.nav} aria-label="Main navigation">
              <a href="#capabilities">Capabilities</a>
              <a href="#work">Selected work</a>
              <a href="#sustainability">Sustainability</a>
            </nav>
            <a href="tel:+85295165785" className={styles.headerLink}>Get in touch <Phone size={15} aria-hidden="true" /></a>
          </div>
        </div>
      </header>

      <main id="main" tabIndex={-1}>
        <section className={`${styles.container} ${styles.hero}`} aria-labelledby="intro-title">
          <div className={styles.heroCopy}>
            <p className={styles.kicker}>3D engineering & spatial technology</p>
            <h1 id="intro-title">From data to <em>fabrication.</em></h1>
            <p className={styles.heroLead}>We build 3D models, print-ready parts and digital twins, and research more resource-efficient designs and materials.</p>
            <div className={styles.heroActions}>
              <a className={styles.primaryLink} href="#work">Explore our work <ArrowDown size={17} aria-hidden="true" /></a>
              <a className={styles.textLink} href="#sustainability">Our commitment <ArrowRight size={16} aria-hidden="true" /></a>
            </div>
          </div>
          <figure className={styles.heroArt}>
            <figcaption className={styles.artCaption}><span><i /> DIGITAL TWIN / TACTILE MAP</span><span>FIG. 01</span></figcaption>
            <div className={styles.artStage}>
              <Image className={styles.campusArt} src="/showcase/campus-hero.webp" alt="3D render of buildings and open spaces along the Hong Kong Science Park waterfront" width={900} height={442} unoptimized priority />
              <div className={styles.tactileInset}>
                <Image src="/showcase/hkstp-tactile.webp" alt="Raised-relief STL render of Hong Kong Science Park" width={192} height={121} unoptimized />
                <span>TACTILE STL</span>
              </div>
            </div>
            <div className={styles.artFooter}><span>HONG KONG SCIENCE PARK</span><a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a></div>
          </figure>
        </section>

        <section id="capabilities" className={`${styles.container} ${styles.section}`} aria-labelledby="capabilities-title">
          <div className={styles.sectionHeading}>
            <div><p className={styles.kicker}>01 / Capabilities</p><h2 id="capabilities-title">What we do</h2></div>
            <p>We work across the digital and physical sides of engineering: modeling geometry, making parts and turning spatial data into tools people can use. We also have a self-curated vector database.</p>
          </div>
          <div className={styles.capabilityGrid}>
            {capabilities.map(({ title, description, specialties, icon: Icon }) => (
              <article className={styles.capability} key={title}>
                <Icon size={26} strokeWidth={1.65} aria-hidden="true" />
                <h3>{title}</h3>
                <p>{description}</p>
                <ul>{specialties.map(specialty => <li key={specialty}>{specialty}</li>)}</ul>
              </article>
            ))}
          </div>
        </section>

        <section id="work" className={styles.work} aria-labelledby="work-title">
          <div className={`${styles.container} ${styles.section}`}>
            <div className={styles.sectionHeading}>
              <div><p className={styles.kicker}>02 / Selected work</p><h2 id="work-title">Technology in practice</h2></div>
              <p>See how we turn an image, a scan or a map into something you can inspect, explore or print.</p>
            </div>
            <div className={styles.projectGrid}>
              {projects.map(project => (
                <article className={styles.project} key={project.title}>
                  {project.image ? (
                    <figure className={styles.projectArt}>
                      <Image src={project.image} alt="" width={480} height={300} unoptimized />
                      <figcaption>{project.imageLabel} · <a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a></figcaption>
                    </figure>
                  ) : (
                    <figure className={styles.projectArt}>
                      <div className={styles.workflow}>
                        <p>PHOTO OR SCAN TO STL</p>
                        <ol><li>Capture the shape</li><li>Repair and scale the mesh</li><li>Export a print-ready model</li></ol>
                      </div>
                      <figcaption>Process overview</figcaption>
                    </figure>
                  )}
                  <div className={styles.projectCopy}>
                    <p className={styles.projectCategory}>{project.category}</p>
                    <h3>{project.title}</h3>
                    <p>{project.description}</p>
                    {project.href.startsWith("/")
                      ? <Link className={styles.textLink} href={project.href} prefetch={false}>{project.action} <ArrowRight size={16} aria-hidden="true" /></Link>
                      : <a className={styles.textLink} href={project.href}>{project.action} <ArrowUpRight size={16} aria-hidden="true" /></a>}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="sustainability" className={styles.sustainability} aria-labelledby="sustainability-title">
          <div className={`${styles.container} ${styles.section}`}>
            <div className={styles.sectionHeading}>
              <div><p className={styles.kicker}>03 / Sustainability</p><h2 id="sustainability-title">Engineering for sustainable development</h2></div>
              <p>We use the <a href="https://www.un.org/sustainabledevelopment">United Nations’ Sustainable Development Goals</a> to guide our work toward responsible innovation, inclusive places and more resource-efficient fabrication.</p>
            </div>
            <div className={styles.goalGrid}>
              {goals.map(goal => (
                <article className={styles.goal} key={goal.number}>
                  <Image className={styles.goalIcon} src={`/showcase/sdg-${goal.number}.jpg`} alt={`Goal ${goal.number}`} width={112} height={112} unoptimized />
                  <h3><a href={goal.href}>{goal.title} <ArrowUpRight size={16} aria-hidden="true" /></a></h3>
                  <p>{goal.description}</p>
                </article>
              ))}
            </div>
            <p className={styles.goalNote}>The content of this publication has not been approved by the United Nations and does not reflect the views of the United Nations or its officials or Member States. <a href="https://www.un.org/sustainabledevelopment/wp-content/uploads/2023/09/E_SDG_Guidelines_Sep20238.pdf">UN icon usage guidelines (PDF)</a>.</p>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={`${styles.container} ${styles.footerInner}`}>
          <a href="#top" aria-label="meshPotato home"><Wordmark /></a>
          <a className={styles.textLink} href="tel:+85295165785"><Phone size={16} aria-hidden="true" /> +852 9516 5785</a>
          <div className={styles.social}>
            <button className={styles.socialButton} type="button" aria-describedby="social-note" disabled>
              <Share2 size={16} aria-hidden="true" /> Social media
            </button>
            <span id="social-note">Link coming soon</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
