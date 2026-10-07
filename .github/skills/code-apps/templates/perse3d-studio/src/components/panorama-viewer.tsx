import { useEffect, useRef } from "react"
import * as THREE from "three"

/** Blender の equirectangular 出力（panorama.png）をドラッグで見回す 360° ビューア */
export function PanoramaViewer({ src, className }: { src: string; className?: string }) {
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = host.current
    if (!el) return
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    el.appendChild(renderer.domElement)
    renderer.domElement.style.touchAction = "none"
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 100)
    const geo = new THREE.SphereGeometry(10, 64, 32)
    geo.scale(-1, 1, 1)
    const tex = new THREE.TextureLoader().load(src)
    tex.colorSpace = THREE.SRGBColorSpace
    const mat = new THREE.MeshBasicMaterial({ map: tex })
    scene.add(new THREE.Mesh(geo, mat))
    let lon = 90
    let lat = 0
    let drag: { x: number; y: number } | null = null
    let raf = 0
    const resize = () => {
      renderer.setSize(el.clientWidth, el.clientHeight)
      camera.aspect = el.clientWidth / Math.max(1, el.clientHeight)
      camera.updateProjectionMatrix()
    }
    const ro = new ResizeObserver(resize)
    ro.observe(el)
    resize()
    const down = (e: PointerEvent) => (drag = { x: e.clientX, y: e.clientY })
    const move = (e: PointerEvent) => {
      if (!drag) return
      lon -= (e.clientX - drag.x) * 0.15
      lat = Math.max(-85, Math.min(85, lat + (e.clientY - drag.y) * 0.15))
      drag = { x: e.clientX, y: e.clientY }
    }
    const up = () => (drag = null)
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      camera.fov = Math.max(35, Math.min(95, camera.fov + e.deltaY * 0.03))
      camera.updateProjectionMatrix()
    }
    renderer.domElement.addEventListener("pointerdown", down)
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
    renderer.domElement.addEventListener("wheel", wheel, { passive: false })
    const loop = () => {
      raf = requestAnimationFrame(loop)
      if (!drag) lon += 0.03
      const phi = THREE.MathUtils.degToRad(90 - lat)
      const theta = THREE.MathUtils.degToRad(lon)
      camera.lookAt(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta))
      renderer.render(scene, camera)
    }
    loop()
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
      geo.dispose()
      mat.dispose()
      tex.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [src])
  return <div ref={host} className={className} aria-label="360° パノラマ" />
}
