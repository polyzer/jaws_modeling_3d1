import bpy
import time, json
from os import  listdir, remove
from os.path import isfile, join
import sys
sys.stdout = open('blender-monitor.log', 'w')
times_count = 0
for o in bpy.context.scene.objects:
    o.select = True
bpy.ops.object.delete()


#files_loc_load_dir = '/home/bitrix/mods/'
dirs = ['teeth', 'gum', 'attach']
#Ð¿Ð¾Ð»ÑÑÐ°ÐµÐ¼ Ð¼Ð¾Ð´ÐµÐ»Ð¸, ÐºÐ¾ÑÐ¾ÑÑÐµ ÑÐ»ÐµÐ´ÑÐµÑ Ð¾Ð±ÑÐ°Ð±Ð¾ÑÐ°ÑÑ
dirs_files_dir = "/home/bitrix/models/changes/"
base_files_dir = "/home/bitrix/"
files_from_changes_dir = [f for f in listdir(dirs_files_dir) if isfile(join(dirs_files_dir, f))]
files_loc_load_dirs = []
for file_name in files_from_changes_dir:
	with open(join(dirs_files_dir, file_name)) as f:
		files_loc_load_dirs.append(f.readline().rstrip())
		f.close()
	remove(join(dirs_files_dir, file_name))

for files_loc_load_dir in files_loc_load_dirs:
	path_name = base_files_dir + files_loc_load_dir +  "teeth_coord.json"
	print(path_name)
	teeth_coords_file = open(path_name, "w")
	save_json_data = {}
	save_json_data['teeth_coords'] = {}
	for dir_name in dirs:
		full_dir_name = base_files_dir + files_loc_load_dir + dir_name
		onlyfiles = [f for f in listdir(full_dir_name) if isfile(join(full_dir_name, f))]
		for filename in onlyfiles:
			full_file_load_path = join(base_files_dir + files_loc_load_dir, dir_name, filename)
			imported_object = bpy.ops.import_mesh.stl(filepath=full_file_load_path)
			stl_object = bpy.context.selected_objects[0] ####<--Fix
			bpy.ops.object.select_all(action='DESELECT')
			stl_object.select = True
			print('Imported name: ', stl_object.name)
			start = time.time()
			modifier = stl_object.modifiers.new(name="Decimate", type='DECIMATE')
			modifier.ratio = 0.04
			bpy.ops.object.modifier_apply(modifier="Decimate")
			bpy.ops.export_mesh.stl(filepath=full_file_load_path)
			#separation
			if dir_name == 'teeth':
				bpy.ops.mesh.separate(type='LOOSE')
				bpy.ops.object.origin_set(type='ORIGIN_GEOMETRY')
				save_json_data['teeth_coords'][stl_object.name] = []
				for obj in bpy.data.objects:
					save_json_data['teeth_coords'][stl_object.name].append({
						'x': str(obj.location[0]),
						'y': str(obj.location[1]),
						'z': str(obj.location[2])
					})
			#deleting
			for o in bpy.context.scene.objects:
				o.select = True
			bpy.ops.object.delete()
			end = time.time()
			print("time for this model: " + str(end - start))
			times_count += end-start
	#dumping data to file
	json.dump(save_json_data, teeth_coords_file)
	teeth_coords_file.close()			
	print("All time: " + str(times_count))
