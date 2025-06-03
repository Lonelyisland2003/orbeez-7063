// App.js
import React, { useState, useEffect } from 'react';
import { NavigationContainer }             from '@react-navigation/native';
import { createNativeStackNavigator }      from '@react-navigation/native-stack';
import * as ImagePicker                    from 'expo-image-picker';
import * as ImageManipulator               from 'expo-image-manipulator';
import DateTimePicker                      from '@react-native-community/datetimepicker';
import {
  View, Text, TextInput, Button,
  Image, ScrollView, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator,
  Platform
} from 'react-native';

import { db }                              from './firebaseConfig';
import {
  collection, addDoc, getDocs, serverTimestamp
} from 'firebase/firestore';

const Stack = createNativeStackNavigator();

// MRT stations
const stationList = [
  'Ang Mo Kio','Bedok','Bishan','Buona Vista','Boon Lay',
  'Chinatown','City Hall','Dhoby Ghaut','Jurong East',
  'Little India','Novena','Outram Park','Raffles Place',
  'Serangoon','Tampines','Toa Payoh','Woodlands','Yishun'
];

// 1️ Home Screen
function HomeScreen({ navigation }) {
  return (
    <View style={styles.center}>
      <Text style={styles.heading}>What would you like to report?</Text>
      <Button
        title="Lost Item"
        onPress={() => navigation.navigate('Description', { mode: 'lost' })}
      />
      <View style={{ height: 16 }} />
      <Button
        title="Found Item"
        onPress={() => navigation.navigate('Description', { mode: 'found' })}
      />
    </View>
  );
}

// 2️ Description Screen
function DescriptionScreen({ route, navigation }) {
  const { mode } = route.params;
  const [desc, setDesc] = useState('');

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>
        {mode === 'lost' ? 'Describe your lost item' : 'Describe the found item'}
      </Text>
      <TextInput
        placeholder="Item description..."
        value={desc}
        onChangeText={setDesc}
        style={styles.input}
      />
      <Button
        title="Next: Location"
        onPress={() => {
          if (!desc.trim()) {
            Alert.alert('Please enter a description.');
          } else {
            navigation.navigate('Location', { mode, desc });
          }
        }}
      />
    </View>
  );
}

// 3️ Location Screen
function LocationScreen({ route, navigation }) {
  const { mode, desc } = route.params;
  const [station, setStation] = useState(stationList[0]);

  return (
    <View style={[styles.container, { justifyContent: 'space-between' }]}>
      <Text style={styles.heading}>Select the station</Text>
      <ScrollView style={styles.scroll}>
        {stationList.map(s => (
          <TouchableOpacity
            key={s}
            onPress={() => setStation(s)}
            style={[
              styles.stationItem,
              station === s && styles.stationItemSelected
            ]}
          >
            <Text
              style={[
                styles.stationText,
                station === s && styles.stationTextSelected
              ]}
            >
              {s}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <Button
        title="Next: Date & Time"
        onPress={() =>
          navigation.navigate('DateTime', { mode, desc, station })
        }
      />
    </View>
  );
}

// 4️ DateTime Screen
function DateTimeScreen({ route, navigation }) {
  const { mode, desc, station } = route.params;
  const [date, setDate]         = useState(new Date());
  const [showDate, setShowDate] = useState(false);
  const [showTime, setShowTime] = useState(false);

  const onChangeDate = (_, selected) => {
    setShowDate(Platform.OS === 'ios');
    if (selected) {
      setDate(prev => {
        const d = new Date(prev);
        d.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
        return d;
      });
    }
  };
  const onChangeTime = (_, selected) => {
    setShowTime(Platform.OS === 'ios');
    if (selected) {
      setDate(prev => {
        const d = new Date(prev);
        d.setHours(selected.getHours(), selected.getMinutes());
        return d;
      });
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>When did this happen?</Text>
      <View style={styles.datetimeRow}>
        <Button
          title={`Date: ${date.toLocaleDateString()}`}
          onPress={() => setShowDate(true)}
        />
        <Button
          title={`Time: ${date.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}`}
          onPress={() => setShowTime(true)}
        />
      </View>
      {showDate && (
        <DateTimePicker
          value={date}
          mode="date"
          display="spinner"
          onChange={onChangeDate}
        />
      )}
      {showTime && (
        <DateTimePicker
          value={date}
          mode="time"
          display="spinner"
          onChange={onChangeTime}
        />
      )}
      <Button
        title="Next: Photo"
        onPress={() =>
          navigation.navigate('Photo', {
            mode, desc, station, date: date.toISOString()
          })
        }
      />
    </View>
  );
}

// 5️ Photo Screen & Submit
function PhotoScreen({ route, navigation }) {
  const { mode, desc, station, date } = route.params;
  const [photoUri, setPhotoUri] = useState(null);
  const [busy, setBusy]         = useState(false);

  useEffect(() => {
    (async () => {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Camera permission is required');
      }
    })();
  }, []);

  const pickImage = async () => {
    const res = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!res.canceled && res.assets?.length) {
      setPhotoUri(res.assets[0].uri);
    }
  };

  const handleSubmit = async () => {
    if (!photoUri) {
      return Alert.alert('Please take a photo.');
    }
    setBusy(true);
    try {
      const manip = await ImageManipulator.manipulateAsync(
        photoUri,
        [{ resize: { width: 600 } }],
        { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      const b64 = manip.base64;

      const collName = mode === 'lost' ? 'lostItems' : 'foundItems';
      await addDoc(collection(db, collName), {
        description:  desc,
        station,
        incidentDate: new Date(date),
        imageBase64:  b64,
        reportedAt:   serverTimestamp()
      });

      const other = mode === 'lost' ? 'foundItems' : 'lostItems';
      const snap  = await getDocs(collection(db, other));
      const matches = snap.docs
        .map(d => d.data())
        .filter(d =>
          d.description.toLowerCase().includes(desc.toLowerCase())
        );

      Alert.alert(
        matches.length
          ? `Found ${matches.length} potential match(es)!`
          : 'Saved successfully!'
      );
      navigation.popToTop();
    } catch (e) {
      console.error(e);
      Alert.alert('Upload failed', e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>
        {mode === 'lost' ? 'Snap your lost item' : 'Snap the found item'}
      </Text>
      <Button title="Take Photo" onPress={pickImage} />
      {photoUri && <Image source={{ uri: photoUri }} style={styles.preview} />}
      {busy
        ? <ActivityIndicator size="large" style={{ marginTop: 20 }} />
        : <Button title="Submit" onPress={handleSubmit} />
      }
    </View>
  );
}

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Home">
        <Stack.Screen name="Home"        component={HomeScreen} />
        <Stack.Screen name="Description" component={DescriptionScreen} />
        <Stack.Screen name="Location"    component={LocationScreen} />
        <Stack.Screen name="DateTime"    component={DateTimeScreen} />
        <Stack.Screen name="Photo"       component={PhotoScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  center:      { flex:1, justifyContent:'center', alignItems:'center', padding:20 },
  container:   { flex:1, padding:20, backgroundColor:'#fff' },
  heading:     { fontSize:24, marginBottom:20, textAlign:'center' },
  input:       { borderWidth:1, padding:10, marginBottom:20, borderRadius:4, backgroundColor:'#f5f5f5' },
  datetimeRow: { flexDirection:'row', justifyContent:'space-between', marginBottom:20 },
  preview:     { width:200, height:200, marginVertical:20, alignSelf:'center' },
  scroll:      { flex:1, marginVertical:10 },
  stationItem: {
    paddingVertical:12,
    paddingHorizontal:16,
    borderBottomWidth:1,
    borderColor:'#ddd'
  },
  stationItemSelected: {
    backgroundColor:'#3366FF'
  },
  stationText: {
    fontSize:18
  },
  stationTextSelected: {
    color:'#fff',
    fontWeight:'bold'
  }
});
