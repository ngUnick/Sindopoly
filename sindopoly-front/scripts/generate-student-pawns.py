"""Generate the four normalized student pawn GLBs with Blender 5.2.

Run: blender --background --python scripts/generate-student-pawns.py --
Optional: --output-dir PATH --preview-dir PATH

Blender uses Z up and -Y forward. glTF export maps these to Y up and +Z
forward, so a token's front is built toward Blender -Y. All geometry is
baked into mesh coordinates; exported object transforms remain identity.
"""

import argparse
import math
from pathlib import Path
import sys
import traceback

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "src" / "assets" / "models" / "pawns"
KINDS = ("Backpack", "FrappeCup", "GraduationCap", "Laptop")


def arguments():
    trailing = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--preview-dir", type=Path)
    return parser.parse_args(trailing)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for material in list(bpy.data.materials):
        bpy.data.materials.remove(material)


def material(name, color, roughness, metalness=0.0):
    value = bpy.data.materials.new(name)
    value.diffuse_color = (*color, 1.0)
    principled = value.node_tree.nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = (*color, 1.0)
    principled.inputs["Roughness"].default_value = roughness
    principled.inputs["Metallic"].default_value = metalness
    return value


def palette(kind):
    if kind == "FrappeCup":
        body = (0.76, 0.69, 0.56)
        dark = (0.105, 0.145, 0.16)
    elif kind == "GraduationCap":
        body = (0.115, 0.18, 0.25)
        dark = (0.06, 0.09, 0.13)
    elif kind == "Laptop":
        body = (0.35, 0.40, 0.43)
        dark = (0.075, 0.115, 0.14)
    else:
        body = (0.32, 0.39, 0.42)
        dark = (0.105, 0.16, 0.19)
    return {
        "M_Body": material("M_Body", body, 0.58, 0.08 if kind == "Laptop" else 0.0),
        "M_Dark": material("M_Dark", dark, 0.64),
        "M_Accent": material("M_Accent", (0.018, 0.39, 0.34), 0.47, 0.08),
        "M_Base": material("M_Base", (0.16, 0.19, 0.21), 0.56, 0.12),
    }


def finish(obj, surface, bevel=0.0, smooth=False):
    obj.data.materials.append(surface)
    if bevel:
        modifier = obj.modifiers.new("Soft manufactured edges", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    if smooth:
        for face in obj.data.polygons:
            face.use_smooth = True
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    obj.select_set(False)
    return obj


def box(name, location, dimensions, surface, bevel=0.0, rotation=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    if rotation:
        obj.rotation_euler = rotation
    return finish(obj, surface, bevel)


def cylinder(name, location, radius, height, surface, vertices=24, radius_top=None):
    if radius_top is None or radius_top == radius:
        bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=height, location=location)
    else:
        bpy.ops.mesh.primitive_cone_add(
            vertices=vertices, radius1=radius, radius2=radius_top,
            depth=height, location=location,
        )
    obj = bpy.context.object
    obj.name = name
    return finish(obj, surface, bevel=0.0, smooth=True)


def rod(name, start, end, radius, surface, vertices=10):
    a, b = Vector(start), Vector(end)
    midpoint = (a + b) / 2
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices, radius=radius, depth=(b - a).length, location=midpoint,
    )
    obj = bpy.context.object
    obj.name = name
    obj.rotation_euler = (b - a).to_track_quat("Z", "Y").to_euler()
    return finish(obj, surface, smooth=True)


def common_base(mats):
    # The same 0.79 diameter low plinth grounds every model. Its accent ring
    # is wide enough to identify a player at the normal oblique camera distance.
    cylinder("Base_foot", (0, 0, 0.026), 0.395, 0.052, mats["M_Base"], 32)
    cylinder("Base_accent_ring", (0, 0, 0.060), 0.382, 0.018, mats["M_Accent"], 32)
    cylinder("Base_top", (0, 0, 0.078), 0.367, 0.024, mats["M_Base"], 32)


def backpack(m):
    box("Pack_rounded_body", (0, 0.025, 0.49), (0.55, 0.39, 0.70), m["M_Body"], 0.10)
    box("Pack_front_pocket", (0, -0.205, 0.40), (0.40, 0.09, 0.26), m["M_Dark"], 0.035)
    box("Pack_pocket_accent", (0, -0.258, 0.49), (0.25, 0.022, 0.034), m["M_Accent"], 0.008)
    box("Pack_zip_pull", (0.15, -0.269, 0.41), (0.030, 0.024, 0.095), m["M_Accent"], 0.008)
    for side, label in ((-1, "L"), (1, "R")):
        x = side * 0.19
        rod(f"Pack_back_strap_{label}", (x, 0.254, 0.79), (x, 0.272, 0.30), 0.033, m["M_Dark"])
        box(f"Pack_side_trim_{label}", (side * 0.286, 0.024, 0.54),
            (0.027, 0.22, 0.15), m["M_Accent"], 0.008)
    rod("Pack_handle_left", (-0.12, 0.02, 0.815), (-0.12, 0.02, 0.91), 0.035, m["M_Dark"])
    rod("Pack_handle_right", (0.12, 0.02, 0.815), (0.12, 0.02, 0.91), 0.035, m["M_Dark"])
    rod("Pack_handle_top", (-0.12, 0.02, 0.91), (0.12, 0.02, 0.91), 0.035, m["M_Dark"])


def frappe(m):
    cylinder("Cup_tapered_body", (0, 0, 0.43), 0.214, 0.65, m["M_Body"], 32, 0.292)
    cylinder("Cup_accent_sleeve", (0, 0, 0.45), 0.266, 0.13, m["M_Accent"], 32, 0.280)
    cylinder("Cup_lid", (0, 0, 0.775), 0.315, 0.066, m["M_Dark"], 32)
    cylinder("Cup_lid_rim", (0, 0, 0.754), 0.326, 0.022, m["M_Base"], 32)
    cylinder("Cup_lid_center", (0, 0, 0.82), 0.12, 0.025, m["M_Base"], 24)
    rod("Cup_short_straw", (0.075, -0.045, 0.833), (0.096, -0.069, 1.035),
        0.033, m["M_Accent"], 12)


def graduation_cap(m):
    cylinder("Cap_crown", (0, 0, 0.43), 0.255, 0.55, m["M_Body"], 24, 0.235)
    cylinder("Cap_crown_band", (0, 0, 0.19), 0.265, 0.036, m["M_Accent"], 24)
    box("Cap_mortarboard", (0, 0, 0.78), (0.815, 0.815, 0.075), m["M_Dark"], 0.018)
    box("Cap_front_rim", (0, -0.388, 0.731), (0.64, 0.025, 0.025), m["M_Accent"], 0.005)
    cylinder("Cap_top_button", (0.025, 0.015, 0.832), 0.060, 0.035, m["M_Accent"], 16)
    # A solid three-segment tassel survives the projected game-scale footprint.
    rod("Cap_tassel_top", (0.025, 0.015, 0.843), (0.29, -0.20, 0.815), 0.023, m["M_Accent"])
    rod("Cap_tassel_drop", (0.29, -0.20, 0.815), (0.34, -0.32, 0.51), 0.030, m["M_Accent"])
    cylinder("Cap_tassel_tip", (0.34, -0.32, 0.50), 0.046, 0.10, m["M_Accent"], 12)


def laptop(m):
    box("Laptop_keyboard_slab", (0, -0.015, 0.17), (0.73, 0.53, 0.14), m["M_Body"], 0.028)
    box("Laptop_keyboard_field", (0, -0.055, 0.246), (0.57, 0.32, 0.014), m["M_Dark"], 0.012)
    box("Laptop_trackpad", (0, -0.217, 0.248), (0.18, 0.055, 0.014), m["M_Base"], 0.007)
    rod("Laptop_hinge", (-0.31, 0.225, 0.258), (0.31, 0.225, 0.258),
        0.034, m["M_Accent"], 12)
    # The screen leans back ~20 degrees from vertical, making the open shape
    # legible from both normal overview and closer three-quarter views.
    angle = math.radians(-20)
    box("Laptop_screen_frame", (0, 0.325, 0.556), (0.73, 0.062, 0.54),
        m["M_Body"], 0.022, (angle, 0, 0))
    box("Laptop_screen_inset", (0, 0.292, 0.557), (0.60, 0.012, 0.43),
        m["M_Dark"], 0.007, (angle, 0, 0))
    box("Laptop_screen_logo", (0, 0.206, 0.51), (0.095, 0.015, 0.095),
        m["M_Accent"], 0.014, (angle, 0, 0))


BUILDERS = {
    "Backpack": backpack,
    "FrappeCup": frappe,
    "GraduationCap": graduation_cap,
    "Laptop": laptop,
}


def export_one(kind, output_dir):
    clear_scene()
    mats = palette(kind)
    common_base(mats)
    BUILDERS[kind](mats)
    objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if not objects:
        raise RuntimeError(f"{kind}: no exportable meshes")
    for obj in objects:
        if any(abs(value - 1) > 1e-7 for value in obj.scale):
            raise RuntimeError(f"{kind}: non-unit object scale on {obj.name}")
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    path = output_dir / f"{kind}.glb"
    result = bpy.ops.export_scene.gltf(
        filepath=str(path), export_format="GLB", use_selection=True,
        export_cameras=False, export_lights=False, export_animations=False,
        export_apply=True,
    )
    if "FINISHED" not in result or not path.is_file() or path.stat().st_size == 0:
        raise RuntimeError(f"{kind}: GLB export failed: {result}")
    print(f"Exported {path} ({path.stat().st_size} bytes)")


def point_camera(camera, target):
    camera.rotation_euler = (Vector(target) - camera.location).to_track_quat("-Z", "Y").to_euler()


def prepare_preview():
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 640
    scene.render.resolution_y = 640
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.world.color = (0.20, 0.24, 0.27)
    bpy.ops.mesh.primitive_plane_add(size=20, location=(0, 0, -0.012))
    floor = bpy.context.object
    floor.name = "Preview_floor"
    floor.data.materials.append(material("Preview_floor_material", (0.55, 0.55, 0.52), 0.8))
    bpy.ops.object.light_add(type="AREA", location=(3, -4, 5))
    bpy.context.object.data.energy = 600
    bpy.context.object.data.shape = "DISK"
    bpy.context.object.data.size = 4
    bpy.ops.object.light_add(type="AREA", location=(-3, 2, 3))
    bpy.context.object.data.energy = 350
    bpy.context.object.data.size = 3
    bpy.ops.object.camera_add(location=(2.4, -3.2, 2.5))
    camera = bpy.context.object
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 2.0
    point_camera(camera, (0, 0, 0.51))
    scene.camera = camera
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.view_transform = "AgX"
    return camera


def render_previews(output_dir, preview_dir):
    preview_dir.mkdir(parents=True, exist_ok=True)
    for kind in KINDS:
        clear_scene()
        bpy.ops.import_scene.gltf(filepath=str(output_dir / f"{kind}.glb"))
        camera = prepare_preview()
        for label, location, scale in (
            ("oblique", (2.4, -3.2, 2.5), 2.0),
            ("front", (1.5, -3.5, 1.65), 1.7),
        ):
            camera.location = location
            camera.data.ortho_scale = scale
            point_camera(camera, (0, 0, 0.50))
            bpy.context.scene.render.filepath = str(preview_dir / f"{kind}-{label}.png")
            bpy.ops.render.render(write_still=True)
    clear_scene()
    for index, kind in enumerate(KINDS):
        bpy.ops.import_scene.gltf(filepath=str(output_dir / f"{kind}.glb"))
        for obj in bpy.context.selected_objects:
            if obj.type == "MESH":
                obj.location.x += (index - 1.5) * 1.2
    camera = prepare_preview()
    camera.location = (5, -7, 5.3)
    camera.data.ortho_scale = 6.2
    point_camera(camera, (0, 0, 0.50))
    bpy.context.scene.render.resolution_x = 1280
    bpy.context.scene.render.resolution_y = 620
    bpy.context.scene.render.filepath = str(preview_dir / "student-pawns-together.png")
    bpy.ops.render.render(write_still=True)


def main():
    args = arguments()
    output_dir = args.output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    for kind in KINDS:
        export_one(kind, output_dir)
    if args.preview_dir:
        render_previews(output_dir, args.preview_dir.resolve())


if __name__ == "__main__":
    try:
        main()
    except Exception:
        traceback.print_exc()
        sys.exit(1)
