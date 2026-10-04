import { Canvas } from "@react-three/fiber"
import { Grid, OrbitControls } from "@react-three/drei"
import type { Task } from "@/services/construction-service"

function ConstructionModel({ tasks }: { tasks: Task[] }) {
  const visibleTasks = tasks.length ? tasks : [{
    id: "empty", name: "工程未登録", projectId: "", workTypeId: "",
    plannedStart: "", plannedEnd: "", progress: 0, status: 0,
    reportedProgress: 0, reviewStatus: 0, reviewComment: "",
  }]

  return (
    <group position={[0, 0.35, 0]}>
      {visibleTasks.slice(0, 12).map((task, index) => {
        const row = Math.floor(index / 4)
        const column = index % 4
        const height = Math.max(0.3, task.progress / 22)
        const color = task.progress >= 100 ? "#22c55e" : task.progress > 0 ? "#06b6d4" : "#94a3b8"
        return (
          <group key={task.id} position={[(column - 1.5) * 1.5, 0, (row - 1) * 1.6]}>
            <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
              <boxGeometry args={[1.05, height, 1.05]} />
              <meshStandardMaterial color={color} roughness={0.45} metalness={0.08} />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}

export function ProjectModel3d({ tasks }: { tasks: Task[] }) {
  return (
    <div className="h-[30rem] min-h-80 overflow-hidden rounded-2xl border border-slate-200 bg-slate-950" data-tour="project-3d">
      <Canvas camera={{ position: [7, 7, 9], fov: 42 }} shadows aria-label="工事進捗 3D モデル">
        <color attach="background" args={["#07111f"]} />
        <ambientLight intensity={0.8} />
        <directionalLight position={[5, 10, 5]} intensity={2.2} castShadow />
        <ConstructionModel tasks={tasks} />
        <Grid infiniteGrid fadeDistance={20} sectionColor="#22d3ee" cellColor="#334155" />
        <OrbitControls makeDefault minDistance={4} maxDistance={22} />
      </Canvas>
      <div className="pointer-events-none relative -mt-14 flex flex-wrap gap-3 px-4 text-xs font-bold text-slate-200">
        <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />施工済</span>
        <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-cyan-500" />施工中</span>
        <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-slate-400" />未施工</span>
      </div>
    </div>
  )
}
