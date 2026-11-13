import { useEffect, useRef } from "react";
import * as THREE from "three";

export default function HeroScene() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!host || motionPreference.matches) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: false,
        powerPreference: "low-power",
        stencil: false,
      });
    } catch {
      return;
    }

    const isMobile = window.matchMedia("(max-width: 650px)").matches;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.15 : 1.4));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.setAttribute("aria-hidden", "true");
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 20);
    camera.position.z = 4.25;

    const sculpture = new THREE.Group();
    scene.add(sculpture);

    const shellGeometry = new THREE.IcosahedronGeometry(1.08, 1);
    const shellMaterial = new THREE.MeshBasicMaterial({ color: 0xc5a4ff, wireframe: true, transparent: true, opacity: 0.5 });
    const shell = new THREE.Mesh(shellGeometry, shellMaterial);
    shell.rotation.set(0.34, 0.15, -0.12);
    sculpture.add(shell);

    const ringGeometry = new THREE.TorusGeometry(1.39, 0.009, 3, 72);
    const ringMaterial = new THREE.MeshBasicMaterial({ color: 0x56ddf5, transparent: true, opacity: 0.48 });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.rotation.set(0.86, 0.38, 0.2);
    sculpture.add(ring);

    const innerRingGeometry = new THREE.TorusGeometry(0.74, 0.006, 3, 56);
    const innerRingMaterial = new THREE.MeshBasicMaterial({ color: 0xe2c8ff, transparent: true, opacity: 0.42 });
    const innerRing = new THREE.Mesh(innerRingGeometry, innerRingMaterial);
    innerRing.rotation.set(1.14, 0.52, -0.4);
    sculpture.add(innerRing);

    let isInView = false;
    let pageIsVisible = !document.hidden;
    let prefersReducedMotion: boolean = motionPreference.matches;
    let animationFrame = 0;
    let lastRenderAt = 0;
    const frameInterval = 1000 / (isMobile ? 24 : 30);

    const resize = () => {
      const { width, height } = host.getBoundingClientRect();
      if (width < 1 || height < 1) return;
      renderer.setSize(Math.round(width), Math.round(height), false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    const renderFrame = (time: number) => {
      animationFrame = 0;
      if (!isInView || !pageIsVisible || prefersReducedMotion) return;
      animationFrame = window.requestAnimationFrame(renderFrame);
      if (time - lastRenderAt < frameInterval) return;
      const delta = lastRenderAt ? Math.min((time - lastRenderAt) / 16.67, 2) : 1;
      lastRenderAt = time;
      shell.rotation.x += 0.0012 * delta;
      shell.rotation.y += 0.0021 * delta;
      ring.rotation.z -= 0.0015 * delta;
      innerRing.rotation.x += 0.001 * delta;
      renderer.render(scene, camera);
    };

    const stopAnimation = () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      animationFrame = 0;
      lastRenderAt = 0;
    };
    const startAnimation = () => {
      if (!animationFrame && isInView && pageIsVisible && !prefersReducedMotion) {
        animationFrame = window.requestAnimationFrame(renderFrame);
      }
    };

    const intersectionObserver = "IntersectionObserver" in window
      ? new IntersectionObserver(entries => {
        isInView = entries.some(entry => entry.isIntersecting);
        if (isInView) startAnimation();
        else stopAnimation();
      }, { threshold: 0 })
      : undefined;
    if (intersectionObserver) intersectionObserver.observe(host);
    else isInView = true;

    const resizeObserver = "ResizeObserver" in window ? new ResizeObserver(resize) : undefined;
    resizeObserver?.observe(host);
    if (!resizeObserver) window.addEventListener("resize", resize);
    resize();

    const updateVisibility = () => {
      pageIsVisible = !document.hidden;
      if (pageIsVisible) startAnimation();
      else stopAnimation();
    };
    const updateMotionPreference = (event: MediaQueryListEvent) => {
      prefersReducedMotion = event.matches;
      if (prefersReducedMotion) stopAnimation();
      else startAnimation();
    };
    document.addEventListener("visibilitychange", updateVisibility);
    motionPreference.addEventListener?.("change", updateMotionPreference);

    const updatePalette = () => {
      const light = document.documentElement.dataset.theme === "light";
      shellMaterial.color.set(light ? 0x7041b7 : 0xc5a4ff);
      shellMaterial.opacity = light ? 0.36 : 0.5;
      ringMaterial.color.set(light ? 0x0e7490 : 0x56ddf5);
      ringMaterial.opacity = light ? 0.32 : 0.48;
      innerRingMaterial.color.set(light ? 0x9b6bd2 : 0xe2c8ff);
    };
    updatePalette();
    const themeObserver = new MutationObserver(updatePalette);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    return () => {
      stopAnimation();
      intersectionObserver?.disconnect();
      resizeObserver?.disconnect();
      if (!resizeObserver) window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", updateVisibility);
      motionPreference.removeEventListener?.("change", updateMotionPreference);
      themeObserver.disconnect();
      shellGeometry.dispose();
      shellMaterial.dispose();
      ringGeometry.dispose();
      ringMaterial.dispose();
      innerRingGeometry.dispose();
      innerRingMaterial.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return <div ref={hostRef} className="hero-three-canvas" aria-hidden="true" />;
}
