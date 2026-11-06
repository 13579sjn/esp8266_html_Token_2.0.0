import { Fragment, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  AmbientLight,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  EdgesGeometry,
  Float32BufferAttribute,
  FogExp2,
  Group,
  IcosahedronGeometry,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OctahedronGeometry,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Points,
  PointsMaterial,
  PolarGridHelper,
  RingGeometry,
  Scene,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  TorusGeometry,
  WebGLRenderer,
  WireframeGeometry,
} from 'three'
import type { Material, Texture } from 'three'
import type { ViewMode } from './Header'
import { onForgeAction } from '../lib/forgeBus'
import type { ForgeActionKind } from '../lib/forgeBus'

const TEAL = 0x56e3c2
const TEAL_SOFT = 0x2d8f77
const AMBER = 0xe8bd6d

function makeGlowTexture(): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const context = canvas.getContext('2d')
  if (context) {
    const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64)
    gradient.addColorStop(0, 'rgba(170, 255, 235, 1)')
    gradient.addColorStop(0.28, 'rgba(86, 227, 194, 0.65)')
    gradient.addColorStop(1, 'rgba(10, 60, 48, 0)')
    context.fillStyle = gradient
    context.fillRect(0, 0, 128, 128)
  }
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  return texture
}

function makeCodeTexture(lines: string[], accent: string): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 256
  const context = canvas.getContext('2d')
  if (context) {
    context.clearRect(0, 0, 512, 256)
    context.font = '15px "IBM Plex Mono", monospace'
    context.textBaseline = 'top'
    lines.forEach((line, index) => {
      context.fillStyle = index === 0 ? accent : 'rgba(133, 237, 211, 0.62)'
      context.fillText(line, 22, 24 + index * 28)
    })
    context.strokeStyle = 'rgba(86, 227, 194, 0.28)'
    context.strokeRect(7.5, 7.5, 497, 241)
  }
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  return texture
}

function addEdges(
  mesh: Mesh,
  color: number,
  opacity: number,
): LineSegments {
  const edges = new LineSegments(
    new EdgesGeometry(mesh.geometry),
    new LineBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
    }),
  )
  mesh.add(edges)
  return edges
}

export function DataForge({ mode }: { mode: ViewMode }) {
  const sectionRef = useRef<HTMLElement>(null)
  const canvasHostRef = useRef<HTMLDivElement>(null)
  const reticleRef = useRef<HTMLDivElement>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [forgeStatus, setForgeStatus] = useState('READY / AWAITING INPUT')
  const actionRef = useRef<{
    kind: ForgeActionKind
    label?: string
    startedAt: number
    consumed: boolean
  } | null>(null)
  const statusTimerRef = useRef<number | null>(null)

  useEffect(() => {
    const unsubscribe = onForgeAction((action) => {
      actionRef.current = {
        ...action,
        startedAt: performance.now(),
        consumed: false,
      }
      const label = action.label ? ` · ${action.label.slice(0, 24)}` : ''
      setForgeStatus(
        action.kind === 'field'
          ? `PARAM LOCKED${label}`
          : action.kind === 'generate'
            ? 'TOKEN FORGED'
            : action.kind === 'data'
              ? `MESSAGE ASSEMBLED${label}`
              : 'SCREEN SYNC',
      )
      if (statusTimerRef.current) {
        window.clearTimeout(statusTimerRef.current)
      }
      statusTimerRef.current = window.setTimeout(
        () => setForgeStatus('READY / AWAITING INPUT'),
        2400,
      )
    })
    return () => {
      unsubscribe()
      if (statusTimerRef.current) {
        window.clearTimeout(statusTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    const onChange = () =>
      setIsFullscreen(document.fullscreenElement === sectionRef.current)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  function handlePointerMove(event: ReactPointerEvent<HTMLElement>) {
    if (event.pointerType === 'touch') return
    const reticle = reticleRef.current
    if (!reticle) return
    const rect = event.currentTarget.getBoundingClientRect()
    reticle.style.left = `${event.clientX - rect.left}px`
    reticle.style.top = `${event.clientY - rect.top}px`
    reticle.style.opacity = '1'
  }

  function handlePointerLeave() {
    if (reticleRef.current) reticleRef.current.style.opacity = '0'
  }

  useEffect(() => {
    const section = sectionRef.current
    const host = canvasHostRef.current
    if (!section || !host) return
    const sectionElement: HTMLElement = section
    const canvasHost: HTMLDivElement = host

    const reduceMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches
    const canvas = document.createElement('canvas')
    canvas.setAttribute('aria-hidden', 'true')
    host.appendChild(canvas)

    let renderer: WebGLRenderer
    try {
      renderer = new WebGLRenderer({
        canvas,
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
      })
    } catch {
      if (canvas.parentNode === host) host.removeChild(canvas)
      return
    }

    let width = host.clientWidth || window.innerWidth
    let height = host.clientHeight || 300
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5)

    renderer.setPixelRatio(pixelRatio)
    renderer.setSize(width, height, false)
    renderer.outputColorSpace = SRGBColorSpace
    renderer.toneMapping = ACESFilmicToneMapping
    renderer.setClearColor(0x06100d, 1)
    renderer.toneMappingExposure = 1.18

    const scene = new Scene()
    scene.background = new Color(0x06100d)
    scene.fog = new FogExp2(0x06100d, 0.034)
    const camera = new PerspectiveCamera(34, width / height, 0.1, 60)
    const world = new Group()
    scene.add(world)

    const glowTexture = makeGlowTexture()
    const metalMaterial = new MeshStandardMaterial({
      color: 0x0b1b16,
      metalness: 0.82,
      roughness: 0.34,
    })
    const tealMaterial = new MeshStandardMaterial({
      color: 0x0a2d24,
      emissive: TEAL,
      emissiveIntensity: 1.45,
      metalness: 0.55,
      roughness: 0.24,
      transparent: true,
      opacity: 0.9,
    })
    const amberMaterial = new MeshStandardMaterial({
      color: 0x2b2010,
      emissive: AMBER,
      emissiveIntensity: 1.2,
      metalness: 0.55,
      roughness: 0.3,
    })

    function lineMaterial(color: number, opacity: number) {
      return new LineBasicMaterial({
        color,
        transparent: true,
        opacity,
        depthWrite: false,
      })
    }

    function addGlow(
      color: number,
      scale: number,
      position: [number, number, number],
      opacity = 0.8,
    ) {
      const material = new SpriteMaterial({
        map: glowTexture,
        color,
        transparent: true,
        opacity,
        blending: AdditiveBlending,
        depthWrite: false,
      })
      const sprite = new Sprite(material)
      sprite.scale.set(scale, scale, 1)
      sprite.position.set(...position)
      return sprite
    }

    // 地面与坐标网格
    const grid = new PolarGridHelper(12, 16, 8, 64, 0x1b5b4b, 0x0f2e26)
    grid.position.y = -1.55
    const gridMaterial = grid.material as LineBasicMaterial
    gridMaterial.transparent = true
    gridMaterial.opacity = 0.42
    gridMaterial.depthWrite = false
    world.add(grid)

    function addFloorRing(radius: number, color: number, opacity: number) {
      const ring = new Mesh(
        new RingGeometry(radius - 0.018, radius, 96),
        new MeshBasicMaterial({
          color,
          transparent: true,
          opacity,
          side: DoubleSide,
          blending: AdditiveBlending,
          depthWrite: false,
        }),
      )
      ring.rotation.x = -Math.PI / 2
      ring.position.y = -1.52
      world.add(ring)
      return ring
    }

    addFloorRing(4.9, TEAL, 0.42)
    addFloorRing(5.7, TEAL, 0.22)
    addFloorRing(7.1, AMBER, 0.16)

    const platform = new Mesh(
      new CylinderGeometry(5.4, 5.8, 0.22, 64),
      new MeshStandardMaterial({
        color: 0x081511,
        metalness: 0.88,
        roughness: 0.4,
      }),
    )
    platform.position.y = -1.47
    world.add(platform)

    // 传送带
    const conveyor = new Group()
    world.add(conveyor)

    const beltBase = new Mesh(new BoxGeometry(13.8, 0.24, 1.3), metalMaterial)
    beltBase.position.y = -1.02
    conveyor.add(beltBase)
    addEdges(beltBase, TEAL_SOFT, 0.3)

    const belt = new Mesh(
      new BoxGeometry(13.2, 0.06, 0.82),
      new MeshStandardMaterial({
        color: 0x07100d,
        metalness: 0.65,
        roughness: 0.55,
        emissive: 0x0c2a22,
        emissiveIntensity: 0.45,
      }),
    )
    belt.position.y = -0.84
    conveyor.add(belt)

    for (const z of [-0.66, 0.66]) {
      const rail = new Mesh(
        new BoxGeometry(13.8, 0.12, 0.06),
        new MeshStandardMaterial({
          color: 0x0c241d,
          emissive: TEAL_SOFT,
          emissiveIntensity: 0.7,
          metalness: 0.7,
          roughness: 0.25,
        }),
      )
      rail.position.set(0, -0.72, z)
      conveyor.add(rail)
      addEdges(rail, TEAL, 0.44)
    }

    const rollerGeometry = new CylinderGeometry(0.18, 0.18, 0.8, 12)
    const rollerMaterial = new MeshStandardMaterial({
      color: 0x0b201a,
      metalness: 0.8,
      roughness: 0.4,
      emissive: 0x102f27,
      emissiveIntensity: 0.5,
    })
    for (let index = 0; index < 15; index += 1) {
      const roller = new Mesh(rollerGeometry, rollerMaterial)
      roller.rotation.x = Math.PI / 2
      roller.position.set(-6.3 + index * 0.9, -0.95, 0)
      conveyor.add(roller)
    }

    // 数据包
    const packetGeometry = new BoxGeometry(0.32, 0.32, 0.32)
    const edgeGeometry = new EdgesGeometry(packetGeometry)
    const packets: {
      mesh: Mesh
      material: MeshStandardMaterial
      edgeMaterial: LineBasicMaterial
      progress: number
    }[] = []

    for (let index = 0; index < 7; index += 1) {
      const material = new MeshStandardMaterial({
        color: 0x0a2b22,
        emissive: TEAL,
        emissiveIntensity: 1.6,
        metalness: 0.6,
        roughness: 0.2,
        transparent: true,
        opacity: 1,
      })
      const mesh = new Mesh(packetGeometry, material)
      const edgeMaterial = lineMaterial(TEAL, 0.72)
      mesh.add(new LineSegments(edgeGeometry, edgeMaterial))
      mesh.position.set(-6.4 + index * 1.1, -0.6, 0)
      world.add(mesh)
      packets.push({
        mesh,
        material,
        edgeMaterial,
        progress: index / 7,
      })
    }

    // 校验门
    const gates: { outer: Mesh; inner: Mesh }[] = []
    for (const x of [-2.7, 2.7]) {
      const gate = new Group()
      gate.position.set(x, 0.2, 0)
      const outer = new Mesh(
        new TorusGeometry(1.23, 0.022, 8, 80),
        new MeshBasicMaterial({
          color: TEAL,
          transparent: true,
          opacity: 0.55,
          blending: AdditiveBlending,
          depthWrite: false,
        }),
      )
      outer.rotation.y = Math.PI / 2
      gate.add(outer)
      const inner = new Mesh(
        new TorusGeometry(0.92, 0.012, 8, 64),
        new MeshBasicMaterial({
          color: AMBER,
          transparent: true,
          opacity: 0.36,
          blending: AdditiveBlending,
          depthWrite: false,
        }),
      )
      inner.rotation.y = Math.PI / 2
      gate.add(inner)

      for (const z of [-1.02, 1.02]) {
        const support = new Mesh(new BoxGeometry(0.06, 2.6, 0.06), metalMaterial)
        support.position.set(0, 0, z)
        gate.add(support)
        addEdges(support, TEAL_SOFT, 0.28)
      }
      world.add(gate)
      gates.push({ outer, inner })
    }

    // 中央签名核心
    const core = new Group()
    core.position.set(0, 1.05, 0)
    world.add(core)

    const coreMesh = new Mesh(new IcosahedronGeometry(0.55, 1), tealMaterial.clone())
    core.add(coreMesh)

    const coreShell = new LineSegments(
      new WireframeGeometry(new OctahedronGeometry(1.42, 0)),
      lineMaterial(TEAL, 0.36),
    )
    core.add(coreShell)

    const coreRings = [0, 1, 2].map((index) => {
      const ring = new Mesh(
        new TorusGeometry(1.02 + index * 0.16, 0.012, 8, 64),
        new MeshBasicMaterial({
          color: index === 1 ? AMBER : TEAL,
          transparent: true,
          opacity: 0.42,
          blending: AdditiveBlending,
          depthWrite: false,
        }),
      )
      ring.rotation.set(
        index === 0 ? 0.3 : Math.PI / 2,
        index === 2 ? 0.5 : 0,
        index === 1 ? 0.7 : 0,
      )
      core.add(ring)
      return ring
    })

    core.add(addGlow(TEAL, 4.2, [0, 0, 0], 0.78))
    const coreLight = new PointLight(TEAL, 42, 18, 2)
    coreLight.position.set(0, 1.6, 0)
    world.add(coreLight)

    // 机械臂
    const armBase = new Group()
    armBase.position.set(-3.9, -1.02, 1.12)
    world.add(armBase)

    const pedestal = new Mesh(
      new CylinderGeometry(0.32, 0.44, 0.55, 16),
      metalMaterial,
    )
    pedestal.position.y = 0.27
    armBase.add(pedestal)
    addEdges(pedestal, TEAL_SOFT, 0.42)

    const shoulder = new Group()
    shoulder.position.y = 0.52
    armBase.add(shoulder)
    const upperArm = new Mesh(new BoxGeometry(0.18, 1.0, 0.18), metalMaterial)
    upperArm.position.y = 0.5
    shoulder.add(upperArm)
    addEdges(upperArm, TEAL, 0.5)

    const elbow = new Group()
    elbow.position.y = 1.0
    shoulder.add(elbow)
    const forearm = new Mesh(new BoxGeometry(0.13, 0.82, 0.13), metalMaterial)
    forearm.position.y = 0.41
    elbow.add(forearm)
    addEdges(forearm, TEAL, 0.44)

    const wrist = new Group()
    wrist.position.y = 0.82
    elbow.add(wrist)
    const claw = new Mesh(new BoxGeometry(0.4, 0.12, 0.14), amberMaterial)
    wrist.add(claw)
    addEdges(claw, AMBER, 0.58)

    for (const y of [0.52, 1.0, 0.82]) {
      const joint = new Mesh(
        new SphereGeometry(0.09, 12, 12),
        new MeshBasicMaterial({ color: TEAL }),
      )
      joint.position.y = y
      if (y === 0.52) shoulder.add(joint)
      else if (y === 1.0) elbow.add(joint)
      else wrist.add(joint)
    }

    // 进料斗与出料光束
    const hopper = new Group()
    hopper.position.set(-5.6, -0.72, 0)
    world.add(hopper)
    const hopperMesh = new Mesh(
      new CylinderGeometry(0.9, 0.38, 0.8, 6, 1, true),
      new MeshStandardMaterial({
        color: 0x0a1b16,
        metalness: 0.75,
        roughness: 0.35,
        side: DoubleSide,
        transparent: true,
        opacity: 0.8,
      }),
    )
    hopper.add(hopperMesh)
    addEdges(hopperMesh, TEAL_SOFT, 0.36)

    const output = new Group()
    output.position.set(5.9, 0.1, 0)
    world.add(output)
    const beam = new Mesh(
      new CylinderGeometry(0.34, 0.78, 3.2, 24, 1, true),
      new MeshBasicMaterial({
        color: TEAL,
        transparent: true,
        opacity: 0.06,
        side: DoubleSide,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    )
    beam.position.y = 1.2
    output.add(beam)
    const outputRings = [0.3, 0.9, 1.5, 2.1].map((y) => {
      const ring = new Mesh(
        new TorusGeometry(0.78, 0.012, 8, 64),
        new MeshBasicMaterial({
          color: AMBER,
          transparent: true,
          opacity: 0.35,
          blending: AdditiveBlending,
          depthWrite: false,
        }),
      )
      ring.rotation.x = Math.PI / 2
      ring.position.y = y
      output.add(ring)
      return ring
    })
    output.add(addGlow(AMBER, 2.4, [0, 2.0, 0], 0.42))

    // 两侧服务器 / 机柜
    for (const [x, z] of [
      [-6.8, -3.1],
      [6.8, -3.1],
    ] as const) {
      const rack = new Group()
      rack.position.set(x, 0.1, z)
      const body = new Mesh(new BoxGeometry(1.5, 2.6, 0.9), metalMaterial)
      rack.add(body)
      addEdges(body, TEAL_SOFT, 0.3)
      for (let index = 0; index < 5; index += 1) {
        const strip = new Mesh(
          new BoxGeometry(1.15, 0.04, 0.02),
          new MeshBasicMaterial({
            color: index % 2 === 0 ? TEAL : AMBER,
            transparent: true,
            opacity: 0.52,
          }),
        )
        strip.position.set(0, 0.85 - index * 0.34, 0.46)
        rack.add(strip)
      }
      world.add(rack)
    }

    // 代码面板
    const codePanelSpecs = [
      {
        lines: [
          'POST /thing/property/post',
          '{"id":"123","params":{',
          '  "LED":{"value":true}}}',
          'HMAC-SHA1  //  sign',
        ],
        accent: 'rgba(167, 255, 230, 0.9)',
        position: [-4.5, 2.0, -3.3] as const,
        rotation: 0.26,
      },
      {
        lines: [
          'INGEST  ->  VALIDATE',
          'SIGN    ->  PUBLISH',
          'FLOW 07  QUEUE 03',
          'STATUS: FORGE ONLINE',
        ],
        accent: 'rgba(255, 220, 150, 0.9)',
        position: [4.5, 1.75, -3.5] as const,
        rotation: -0.3,
      },
    ]
    const codeMaterials: MeshBasicMaterial[] = []
    for (const spec of codePanelSpecs) {
      const texture = makeCodeTexture(spec.lines, spec.accent)
      const material = new MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: 0.74,
        side: DoubleSide,
        blending: AdditiveBlending,
        depthWrite: false,
      })
      const panel = new Mesh(new PlaneGeometry(3.5, 1.75), material)
      panel.position.set(spec.position[0], spec.position[1], spec.position[2])
      panel.rotation.y = spec.rotation
      world.add(panel)
      codeMaterials.push(material)
    }

    // 漂浮尘埃 / 代码粒子
    const dustCount = 240
    const dustPositions = new Float32Array(dustCount * 3)
    for (let index = 0; index < dustCount; index += 1) {
      dustPositions[index * 3] = (Math.random() - 0.5) * 17
      dustPositions[index * 3 + 1] = Math.random() * 7 - 1.2
      dustPositions[index * 3 + 2] = (Math.random() - 0.5) * 8 - 1
    }
    const dustGeometry = new BufferGeometry()
    dustGeometry.setAttribute(
      'position',
      new Float32BufferAttribute(dustPositions, 3),
    )
    const dust = new Points(
      dustGeometry,
      new PointsMaterial({
        color: TEAL,
        size: 0.032,
        transparent: true,
        opacity: 0.48,
        blending: AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
      }),
    )
    world.add(dust)
    world.add(addGlow(TEAL, 18, [0, 1.5, -8], 0.08))

    scene.add(new AmbientLight(0x4b8d7b, 1.4))
    const amberLight = new PointLight(AMBER, 26, 22, 2)
    amberLight.position.set(-5, 2.5, 2)
    world.add(amberLight)

    const orbit = {
      angle: -0.48,
      targetAngle: -0.48,
      elevation: 0.32,
      targetElevation: 0.32,
      radius: 8.5,
      dragging: false,
    }
    let lastX = 0
    let lastY = 0
    let visible = false
    let rafId = 0
    let lastTimestamp = 0

    function updateCamera(timestamp = 0, actionEnvelope = 0) {
      const radius =
        orbit.radius *
        (1 +
          Math.sin(timestamp * 0.00022) * 0.024 -
          actionEnvelope * 0.045)
      const y = 3.8 + orbit.elevation * 3.2 + Math.sin(timestamp * 0.00018) * 0.08
      camera.position.set(
        Math.sin(orbit.angle) * radius,
        y,
        Math.cos(orbit.angle) * radius,
      )
      camera.lookAt(0, 0.15, 0)
    }

    function updatePackets(delta: number, timestamp: number) {
      for (const packet of packets) {
        packet.progress += delta * 0.0001
        if (packet.progress >= 1) packet.progress -= 1
        const progress = packet.progress
        const x = -6.4 + progress * 12.8
        const lift = progress > 0.82 ? (progress - 0.82) * 3.4 : 0
        const nearCore = Math.max(0, 1 - Math.abs(x) / 1.4)
        packet.mesh.position.set(x, -0.6 + lift, 0)
        packet.mesh.rotation.x += delta * 0.0008
        packet.mesh.rotation.y += delta * 0.0012
        packet.mesh.scale.setScalar(0.86 + nearCore * 0.28)
        packet.material.emissive.setHex(progress > 0.52 ? AMBER : TEAL)
        packet.material.emissiveIntensity = 1.15 + nearCore * 1.8
        packet.material.opacity =
          progress > 0.9 ? Math.max(0, 1 - (progress - 0.9) / 0.1) : 1
        packet.edgeMaterial.opacity = 0.35 + nearCore * 0.45
        packet.mesh.visible = packet.material.opacity > 0.02
      }

      core.rotation.y += delta * 0.00055
      coreShell.rotation.y -= delta * 0.0004
      coreShell.rotation.x += delta * 0.00018
      coreRings.forEach((ring, index) => {
        ring.rotation.z += delta * (0.00032 + index * 0.0001)
      })
      coreMesh.scale.setScalar(1 + Math.sin(timestamp * 0.002) * 0.035)

      gates.forEach((gate, index) => {
        gate.outer.rotation.z += delta * (index === 0 ? 0.0007 : -0.0006)
        gate.inner.rotation.z -= delta * 0.0005
      })

      shoulder.rotation.z = -0.62 + Math.sin(timestamp * 0.00105) * 0.28
      elbow.rotation.z = 0.72 + Math.sin(timestamp * 0.0013 + 1) * 0.24
      wrist.rotation.z = -0.20 + Math.sin(timestamp * 0.0015) * 0.18
      armBase.rotation.y = 0.08 + Math.sin(timestamp * 0.0007) * 0.12

      outputRings.forEach((ring, index) => {
        const pulse = 0.62 + Math.sin(timestamp * 0.0015 - index * 0.6) * 0.18
        ring.scale.setScalar(pulse)
        ring.rotation.z += delta * 0.0004
      })

      dust.rotation.y += delta * 0.00004
      codeMaterials.forEach((material, index) => {
        material.opacity = 0.68 + Math.sin(timestamp * 0.0009 + index) * 0.045
      })
      coreLight.intensity = 34 + Math.sin(timestamp * 0.002) * 6
    }

    function renderScene(delta: number, timestamp: number) {
      if (!orbit.dragging) orbit.targetAngle += delta * 0.00018
      orbit.angle += (orbit.targetAngle - orbit.angle) * 0.065
      orbit.elevation += (orbit.targetElevation - orbit.elevation) * 0.07
      updatePackets(delta, timestamp)

      let actionEnvelope = 0
      const action = actionRef.current
      if (action) {
        const duration =
          action.kind === 'generate'
            ? 1500
            : action.kind === 'data'
              ? 1100
              : action.kind === 'switch'
                ? 900
                : 820
        const age = timestamp - action.startedAt
        if (age >= duration) {
          actionRef.current = null
          gates.forEach((gate) => gate.outer.scale.setScalar(1))
        } else {
          actionEnvelope = Math.sin(Math.min(1, age / duration) * Math.PI)
          const kick = Math.sin(age * 0.022) * actionEnvelope
          shoulder.rotation.z += kick * (action.kind === 'field' ? 0.28 : 0.44)
          elbow.rotation.z += kick * 0.2
          coreMesh.scale.multiplyScalar(1 + actionEnvelope * 0.18)
          coreLight.intensity += actionEnvelope * 34
          gates.forEach((gate) =>
            gate.outer.scale.setScalar(1 + actionEnvelope * 0.16),
          )
          outputRings.forEach((ring) =>
            ring.scale.multiplyScalar(1 + actionEnvelope * 0.28),
          )

          if (!action.consumed) {
            action.consumed = true
            if (action.kind === 'generate' || action.kind === 'data') {
              packets.forEach((packet, index) => {
                packet.progress = index / packets.length
              })
            } else if (action.kind === 'field') {
              packets[0].progress = 0
            }
          }
        }
      } else {
        gates.forEach((gate) => gate.outer.scale.setScalar(1))
      }

      updateCamera(timestamp, actionEnvelope)
      renderer.render(scene, camera)
    }

    function start() {
      if (rafId || reduceMotion || document.hidden) return
      lastTimestamp = 0
      rafId = window.requestAnimationFrame(animate)
    }

    function stop() {
      if (!rafId) return
      window.cancelAnimationFrame(rafId)
      rafId = 0
    }

    function animate(timestamp: number) {
      rafId = 0
      if (!visible || document.hidden) return
      const delta = lastTimestamp ? Math.min(40, timestamp - lastTimestamp) : 16
      lastTimestamp = timestamp
      renderScene(delta, timestamp)
      rafId = window.requestAnimationFrame(animate)
    }

    function handlePointerDown(event: PointerEvent) {
      if (reduceMotion || event.pointerType !== 'mouse') return
      orbit.dragging = true
      lastX = event.clientX
      lastY = event.clientY
      sectionElement.classList.add('is-grabbing')
      try {
        canvas.setPointerCapture(event.pointerId)
      } catch {
        // optional capture
      }
    }

    function handlePointerMove(event: PointerEvent) {
      if (!orbit.dragging) return
      const dx = event.clientX - lastX
      const dy = event.clientY - lastY
      lastX = event.clientX
      lastY = event.clientY
      orbit.targetAngle -= dx * 0.006
      orbit.targetElevation = Math.min(
        0.78,
        Math.max(0.08, orbit.targetElevation + dy * 0.003),
      )
    }

    function handlePointerUp(event: PointerEvent) {
      orbit.dragging = false
      sectionElement.classList.remove('is-grabbing')
      try {
        canvas.releasePointerCapture(event.pointerId)
      } catch {
        // optional release
      }
    }

    function handleResize() {
      width = canvasHost.clientWidth || window.innerWidth
      height = canvasHost.clientHeight || 300
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
      renderer.setSize(width, height, false)
      const aspect = width / height
      orbit.radius = width < 720 ? 11.4 : aspect < 2.2 ? 18 : 8.5
      world.scale.setScalar(width < 720 ? 0.72 : 1)
      updateCamera()
      if (reduceMotion) renderer.render(scene, camera)
    }

    function handleVisibility() {
      if (document.hidden) stop()
      else if (visible) start()
    }

    const observer = new IntersectionObserver(
      (entries) => {
        visible = Boolean(entries[0]?.isIntersecting)
        if (visible) start()
        else stop()
      },
      { threshold: 0.04 },
    )
    observer.observe(section)

    const resizeObserver = new ResizeObserver(() => handleResize())
    resizeObserver.observe(host)

    canvas.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerUp)
    window.addEventListener('resize', handleResize)
    document.addEventListener('visibilitychange', handleVisibility)

    handleResize()
    if (reduceMotion) {
      updatePackets(0, 0)
      updateCamera()
      renderer.render(scene, camera)
    } else {
      updateCamera()
      renderer.render(scene, camera)
      start()
    }

    return () => {
      stop()
      observer.disconnect()
      resizeObserver.disconnect()
      canvas.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
      window.removeEventListener('resize', handleResize)
      document.removeEventListener('visibilitychange', handleVisibility)

      scene.traverse((object) => {
        const disposable = object as {
          geometry?: BufferGeometry
          material?: Material
        }
        disposable.geometry?.dispose()
        if (disposable.material) {
          const mapped = disposable.material as Material & { map?: Texture }
          mapped.map?.dispose()
          disposable.material.dispose()
        }
      })
      glowTexture.dispose()
      renderer.forceContextLoss()
      renderer.dispose()
      if (canvas.parentNode === host) host.removeChild(canvas)
      sectionElement.classList.remove('is-grabbing')
    }
  }, [])

  const stageLabels =
    mode === 'token'
      ? ['01 PARAMS', '02 HMAC', '03 ASSEMBLE', '04 TOKEN']
      : ['01 INGEST', '02 PARSE', '03 BUILD', '04 REPLY']
  const forgeTitle = mode === 'token' ? '密钥装配线' : '报文装配线'
  const forgeModeLabel =
    mode === 'token'
      ? 'INTERNET FACTORY / TOKEN ASSEMBLY'
      : 'INTERNET FACTORY / DATA LINK'

  return (
    <section
      className="data-forge"
      id="data-forge"
      data-mode={mode}
      aria-label={`3D ${forgeTitle}可视化`}
      ref={sectionRef}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
    >
      <div className="forge-canvas" ref={canvasHostRef} aria-hidden="true" />
      <div className="forge-scan" aria-hidden="true" />
      <div className="forge-vignette" aria-hidden="true" />

      <div className="forge-topbar">
        <span className="forge-live">
          <span className="forge-led" />
          LIVE FORGE
        </span>
        <span className="forge-topbar-mid">{forgeModeLabel}</span>
        <span className="forge-topbar-right">PROCEDURAL · LOCAL</span>
      </div>

      <button
        type="button"
        className="forge-fullscreen"
        onClick={() => {
          const section = sectionRef.current
          if (!section) return
          if (document.fullscreenElement) {
            void document.exitFullscreen()
          } else {
            const request = section.requestFullscreen?.()
            if (request) void request.catch(() => undefined)
          }
        }}
        aria-label={
          isFullscreen ? '退出全屏 3D 装配线' : '切换全屏 3D 装配线'
        }
      >
        <span aria-hidden="true">{isFullscreen ? '⤡' : '⛶'}</span>
        {isFullscreen ? '退出' : '全屏'}
      </button>

      <div className="forge-title">
        <span>
          CODE WORLD / {mode === 'token' ? 'TOKEN WORKBENCH' : 'DATA WORKBENCH'}
        </span>
        <strong>{forgeTitle}</strong>
        <em className="forge-status">{forgeStatus}</em>
      </div>

      <div className="forge-stages" aria-hidden="true">
        {stageLabels.map((stage, index) => (
          <Fragment key={stage}>
            {index > 0 ? <i /> : null}
            <span>{stage}</span>
          </Fragment>
        ))}
      </div>

      <div className="forge-hint">拖拽抓取视角 / DRAG TO ORBIT</div>
      <div className="forge-reticle" ref={reticleRef} aria-hidden="true" />
    </section>
  )
}
