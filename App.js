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
  Platform, FlatList
} from 'react-native';

import { db }                              from './firebaseConfig';
import {
  collection, addDoc, getDocs, serverTimestamp, query, where, updateDoc, doc
} from 'firebase/firestore';

const Stack = createNativeStackNavigator();

// MRT stations
const stationList = [
  'Ang Mo Kio','Bedok','Bishan','Buona Vista','Boon Lay',
  'Chinatown','City Hall','Dhoby Ghaut','Jurong East',
  'Little India','Novena','Outram Park','Raffles Place',
  'Serangoon','Tampines','Toa Payoh','Woodlands','Yishun'
];

// Item categories
const itemCategories = [
  {
    id: 'personal',
    name: 'Personal Belongings',
    items: ['Wallet', 'Purse', 'Keys', 'ID Card', 'Student Pass', 'Sunglasses', 'Eyeglasses', 'Watch', 'Jewelry', 'Mobile Phone', 'Earphones', 'AirPods', 'Umbrella', 'Water Bottle', 'Lanyard', 'Access Card', 'Notebook', 'Planner', 'Tote Bag', 'Shopping Bag']
  },
  {
    id: 'bags',
    name: 'Bags & Luggage',
    items: ['Backpack', 'Briefcase', 'Handbag', 'Duffel Bag', 'Carry-on Luggage', 'Trolley Bag', 'Plastic Bag', 'Paper Bag', 'Laptop Bag']
  },
  {
    id: 'electronics',
    name: 'Electronics & Gadgets',
    items: ['Laptop', 'Tablet', 'Power Bank', 'Charger', 'Cable', 'USB Drive', 'External Hard Drive', 'E-reader', 'Camera', 'GoPro', 'Smartwatch', 'Fitness Tracker', 'Game Console', 'Handheld Game Device']
  },
  {
    id: 'documents',
    name: 'Documents & Printed Items',
    items: ['Book', 'School Notes', 'Legal Documents', 'Official Papers', 'Exam Scripts', 'Envelopes', 'Tickets', 'Passport']
  },
  {
    id: 'clothing',
    name: 'Clothing & Accessories',
    items: ['Jacket', 'Coat', 'Hat', 'Cap', 'Gloves', 'Scarf', 'Sweater', 'Shoes', 'Slippers', 'Tie', 'Belt']
  },
  {
    id: 'children',
    name: "Children's Items",
    items: ['Toys', 'Diaper Bag', 'Milk Bottle', 'Stroller', 'School Bag', 'Blanket', 'Soft Toy', "Children's Shoes", "Children's Clothes"]
  },
  {
    id: 'sports',
    name: 'Sports & Fitness Items',
    items: ['Yoga Mat', 'Sports Shoes', 'Gym Bag', 'Racket', 'Ball', 'Swim Goggles', 'Swimsuit']
  },
  {
    id: 'food',
    name: 'Food & Beverages',
    items: ['Lunch Box', 'Tupperware', 'Takeaway Food', 'Snack', 'Coffee Cup', 'Flask', 'Grocery Bag']
  },
  {
    id: 'health',
    name: 'Health & Hygiene',
    items: ['Medication', 'Inhaler', 'Sanitary Items', 'Makeup Bag', 'Hand Sanitizer', 'Skincare Products']
  },
  {
    id: 'pet',
    name: 'Pet-related Items',
    items: ['Pet Carrier', 'Leash', 'Pet Food', 'Pet Toy', 'Pet Blanket']
  }
];

// Utility function to calculate text similarity
function calculateSimilarity(str1, str2) {
  if (!str1 || !str2) return 0;
  
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();
  
  // Exact match
  if (s1 === s2) return 1;
  
  // Check if one contains the other
  if (s1.includes(s2) || s2.includes(s1)) return 0.8;
  
  // Word-based similarity
  const words1 = s1.split(/\s+/);
  const words2 = s2.split(/\s+/);
  
  let matchingWords = 0;
  words1.forEach(word1 => {
    words2.forEach(word2 => {
      if (word1 === word2 || word1.includes(word2) || word2.includes(word1)) {
        matchingWords++;
      }
    });
  });
  
  const totalWords = Math.max(words1.length, words2.length);
  const wordSimilarity = matchingWords / totalWords;
  
  // Character-based similarity (Levenshtein-like)
  const maxLen = Math.max(s1.length, s2.length);
  let matches = 0;
  for (let i = 0; i < Math.min(s1.length, s2.length); i++) {
    if (s1[i] === s2[i]) matches++;
  }
  const charSimilarity = matches / maxLen;
  
  // Return weighted average
  return (wordSimilarity * 0.7 + charSimilarity * 0.3);
}

// Function to check if time ranges overlap
function timeRangesOverlap(start1, end1, start2, end2) {
  return start1 <= end2 && start2 <= end1;
}

// Function to find matches
async function findMatches(itemData, searchOppositeType = true) {
  try {
    const collectionName = searchOppositeType 
      ? (itemData.type === 'lost' ? 'foundItems' : 'lostItems')
      : (itemData.type === 'lost' ? 'lostItems' : 'foundItems');
    
    const snapshot = await getDocs(collection(db, collectionName));
    const items = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Calculate match scores
    const matches = items.map(item => {
      let score = 0;
      let matchReasons = [];
      
      // Category match (25% weight)
      if (itemData.category && item.category) {
        if (itemData.category === item.category) {
          score += 25;
          matchReasons.push('Same category');
        } else {
          // Penalty for different categories
          score -= 10;
        }
      }
      
      // Description similarity (30% weight)
      const descSimilarity = calculateSimilarity(itemData.description, item.description);
      score += descSimilarity * 30;
      if (descSimilarity > 0.3) {
        matchReasons.push(`Description match: ${Math.round(descSimilarity * 100)}%`);
      }
      
      // Location match (25% weight)
      if (itemData.station === item.station) {
        score += 25;
        matchReasons.push('Same station');
      } else {
        // You could add nearby station logic here
        matchReasons.push('Different station');
      }
      
      // Time overlap (20% weight)
      if (item.startTime && item.endTime && itemData.startTime && itemData.endTime) {
        const overlap = timeRangesOverlap(
          new Date(itemData.startTime),
          new Date(itemData.endTime),
          new Date(item.startTime),
          new Date(item.endTime)
        );
        if (overlap) {
          score += 20;
          matchReasons.push('Time range overlaps');
        }
      }
      
      return {
        ...item,
        matchScore: score,
        matchReasons: matchReasons
      };
    });
    
    // Filter and sort matches
    return matches
      .filter(m => m.matchScore > 15) // Lowered threshold to account for category penalties
      .sort((a, b) => b.matchScore - a.matchScore);
    
  } catch (error) {
    console.error('Error finding matches:', error);
    return [];
  }
}

// Home Screen with Search option
function HomeScreen({ navigation }) {
  return (
    <View style={styles.center}>
      <Text style={styles.heading}>Lost & Found MRT</Text>
      <Button
        title="Report Lost Item"
        onPress={() => navigation.navigate('Description', { mode: 'lost' })}
      />
      <View style={{ height: 16 }} />
      <Button
        title="Report Found Item"
        onPress={() => navigation.navigate('Description', { mode: 'found' })}
      />
      <View style={{ height: 16 }} />
      <Button
        title="Search for Items"
        onPress={() => navigation.navigate('Search')}
      />
      <View style={{ height: 16 }} />
      <Button
        title="My Reports"
        onPress={() => navigation.navigate('MyReports')}
      />
    </View>
  );
}

// Description Screen with Category
function DescriptionScreen({ route, navigation }) {
  const { mode } = route.params;
  const [desc, setDesc] = useState('');
  const [category, setCategory] = useState('');
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>
        {mode === 'lost' ? 'Describe your lost item' : 'Describe the found item'}
      </Text>
      
      <Text style={styles.label}>Category</Text>
      <TouchableOpacity 
        style={styles.categorySelector}
        onPress={() => setShowCategoryPicker(true)}
      >
        <Text style={category ? styles.categoryText : styles.categoryPlaceholder}>
          {category ? itemCategories.find(c => c.id === category)?.name : 'Select a category...'}
        </Text>
      </TouchableOpacity>
      
      <Text style={styles.label}>Description</Text>
      <TextInput
        placeholder="Be specific (e.g., blue leather wallet with zipper)..."
        value={desc}
        onChangeText={setDesc}
        style={styles.input}
        multiline
        numberOfLines={3}
      />
      
      <Button
        title="Next: Location"
        onPress={() => {
          if (!category) {
            Alert.alert('Please select a category.');
          } else if (!desc.trim()) {
            Alert.alert('Please enter a description.');
          } else {
            navigation.navigate('Location', { mode, desc, category });
          }
        }}
      />
      
      {showCategoryPicker && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalHeading}>Select Category</Text>
            <ScrollView style={styles.categoryList}>
              {itemCategories.map(cat => (
                <TouchableOpacity
                  key={cat.id}
                  style={styles.categoryItem}
                  onPress={() => {
                    setCategory(cat.id);
                    setShowCategoryPicker(false);
                  }}
                >
                  <Text style={styles.categoryItemText}>{cat.name}</Text>
                  <Text style={styles.categoryItemHint}>
                    {cat.items.slice(0, 3).join(', ')}...
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <Button 
              title="Cancel" 
              onPress={() => setShowCategoryPicker(false)}
            />
          </View>
        </View>
      )}
    </View>
  );
}

// Location Screen
function LocationScreen({ route, navigation }) {
  const { mode, desc, category } = route.params;
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
          navigation.navigate('DateTime', { mode, desc, category, station })
        }
      />
    </View>
  );
}

// DateTime Screen with Time Range
function DateTimeScreen({ route, navigation }) {
  const { mode, desc, category, station } = route.params;
  const [date, setDate]         = useState(new Date());
  const [startTime, setStartTime] = useState(new Date());
  const [endTime, setEndTime]     = useState(new Date());
  const [showDate, setShowDate]   = useState(false);
  const [showStartTime, setShowStartTime] = useState(false);
  const [showEndTime, setShowEndTime]     = useState(false);

  // Initialize end time to be 1 hour after start time
  useEffect(() => {
    const newEndTime = new Date(startTime);
    newEndTime.setHours(startTime.getHours() + 1);
    setEndTime(newEndTime);
  }, []);

  const onChangeDate = (_, selected) => {
    setShowDate(Platform.OS === 'ios');
    if (selected) {
      setDate(selected);
      // Update both start and end times with the new date
      const newStartTime = new Date(startTime);
      newStartTime.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
      setStartTime(newStartTime);
      
      const newEndTime = new Date(endTime);
      newEndTime.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
      setEndTime(newEndTime);
    }
  };

  const onChangeStartTime = (_, selected) => {
    setShowStartTime(Platform.OS === 'ios');
    if (selected) {
      const newStartTime = new Date(date);
      newStartTime.setHours(selected.getHours(), selected.getMinutes());
      setStartTime(newStartTime);
      
      // Ensure end time is after start time
      if (newStartTime >= endTime) {
        const newEndTime = new Date(newStartTime);
        newEndTime.setHours(newStartTime.getHours() + 1);
        setEndTime(newEndTime);
      }
    }
  };

  const onChangeEndTime = (_, selected) => {
    setShowEndTime(Platform.OS === 'ios');
    if (selected) {
      const newEndTime = new Date(date);
      newEndTime.setHours(selected.getHours(), selected.getMinutes());
      
      // Ensure end time is after start time
      if (newEndTime <= startTime) {
        Alert.alert('Invalid Time', 'End time must be after start time');
        return;
      }
      setEndTime(newEndTime);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>When did this happen?</Text>
      
      <Text style={styles.subheading}>Date</Text>
      <Button
        title={`Date: ${date.toLocaleDateString()}`}
        onPress={() => setShowDate(true)}
      />
      
      <Text style={[styles.subheading, { marginTop: 20 }]}>Time Range</Text>
      <View style={styles.timeRangeContainer}>
        <View style={styles.timeButton}>
          <Text style={styles.timeLabel}>From:</Text>
          <Button
            title={startTime.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}
            onPress={() => setShowStartTime(true)}
          />
        </View>
        <View style={styles.timeButton}>
          <Text style={styles.timeLabel}>To:</Text>
          <Button
            title={endTime.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}
            onPress={() => setShowEndTime(true)}
          />
        </View>
      </View>

      {showDate && (
        <DateTimePicker
          value={date}
          mode="date"
          display="spinner"
          onChange={onChangeDate}
        />
      )}
      {showStartTime && (
        <DateTimePicker
          value={startTime}
          mode="time"
          display="spinner"
          onChange={onChangeStartTime}
        />
      )}
      {showEndTime && (
        <DateTimePicker
          value={endTime}
          mode="time"
          display="spinner"
          onChange={onChangeEndTime}
        />
      )}
      
      <View style={{ marginTop: 30 }}>
        <Button
          title="Next: Photo"
          onPress={() =>
            navigation.navigate('Photo', {
              mode, 
              desc, 
              category,
              station, 
              date: date.toISOString(),
              startTime: startTime.toISOString(),
              endTime: endTime.toISOString()
            })
          }
        />
      </View>
    </View>
  );
}

// Photo Screen & Submit
function PhotoScreen({ route, navigation }) {
  const { mode, desc, category, station, date, startTime, endTime } = route.params;
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
      const itemData = {
        description:  desc,
        category,
        station,
        incidentDate: new Date(date),
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        imageBase64:  b64,
        reportedAt:   serverTimestamp(),
        type: mode,
        status: 'active'
      };
      
      await addDoc(collection(db, collName), itemData);

      // Find matches
      const matches = await findMatches({
        ...itemData,
        startTime,
        endTime
      });

      if (matches.length > 0) {
        Alert.alert(
          'Item saved!',
          `Found ${matches.length} potential match(es)! Check the search screen to view them.`,
          [
            { text: 'View Matches', onPress: () => navigation.navigate('Search') },
            { text: 'OK', onPress: () => navigation.popToTop() }
          ]
        );
      } else {
        Alert.alert('Item saved!', 'We\'ll notify you if a match is found.');
        navigation.popToTop();
      }
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

// Search Screen
function SearchScreen({ navigation }) {
  const [searchType, setSearchType] = useState('lost'); // 'lost' or 'found'
  const [description, setDescription] = useState('');
  const [selectedStation, setSelectedStation] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const performSearch = async () => {
    if (!description.trim() && !selectedStation && !selectedCategory) {
      Alert.alert('Please enter a description, select a category, or choose a station');
      return;
    }

    setLoading(true);
    try {
      const searchData = {
        type: searchType === 'lost' ? 'found' : 'lost', // Search opposite type
        description: description,
        station: selectedStation || null,
        category: selectedCategory || null,
      };

      const matches = await findMatches(searchData, false);
      setResults(matches);
      
      if (matches.length === 0) {
        Alert.alert('No matches found', 'Try adjusting your search criteria');
      }
    } catch (error) {
      Alert.alert('Search failed', error.message);
    } finally {
      setLoading(false);
    }
  };

  const renderResultItem = ({ item }) => (
    <TouchableOpacity 
      style={styles.resultItem}
      onPress={() => navigation.navigate('ItemDetail', { item, isMyItem: false })}
    >
      <View style={styles.resultHeader}>
        <Text style={styles.resultDescription}>{item.description}</Text>
        <Text style={styles.matchScore}>{Math.round(item.matchScore)}% match</Text>
      </View>
      <Text style={styles.resultCategory}>
        {itemCategories.find(c => c.id === item.category)?.name || 'Uncategorized'}
      </Text>
      <Text style={styles.resultStation}>Station: {item.station}</Text>
      {item.status === 'returned' && (
        <Text style={styles.returnedIndicator}>✓ Returned to {item.returnStation}</Text>
      )}
      <View style={styles.matchReasonsContainer}>
        {item.matchReasons.map((reason, index) => (
          <Text key={index} style={styles.matchReason}>• {reason}</Text>
        ))}
      </View>
      {item.imageBase64 && (
        <Image 
          source={{ uri: `data:image/jpeg;base64,${item.imageBase64}` }} 
          style={styles.resultImage}
        />
      )}
    </TouchableOpacity>
  );

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.heading}>Search Items</Text>
      
      <Text style={styles.label}>I'm looking for:</Text>
      <View style={styles.searchTypeContainer}>
        <TouchableOpacity
          style={[styles.typeButton, searchType === 'lost' && styles.typeButtonActive]}
          onPress={() => setSearchType('lost')}
        >
          <Text style={[styles.typeButtonText, searchType === 'lost' && styles.typeButtonTextActive]}>
            My Lost Item
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.typeButton, searchType === 'found' && styles.typeButtonActive]}
          onPress={() => setSearchType('found')}
        >
          <Text style={[styles.typeButtonText, searchType === 'found' && styles.typeButtonTextActive]}>
            Item I Found
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.label}>Category:</Text>
      <ScrollView style={styles.categoryPicker} nestedScrollEnabled>
        <TouchableOpacity
          onPress={() => setSelectedCategory('')}
          style={[styles.categoryPickerItem, !selectedCategory && styles.categoryPickerItemSelected]}
        >
          <Text style={[styles.categoryPickerText, !selectedCategory && styles.categoryPickerTextSelected]}>
            All Categories
          </Text>
        </TouchableOpacity>
        {itemCategories.map(cat => (
          <TouchableOpacity
            key={cat.id}
            onPress={() => setSelectedCategory(cat.id)}
            style={[styles.categoryPickerItem, selectedCategory === cat.id && styles.categoryPickerItemSelected]}
          >
            <Text style={[styles.categoryPickerText, selectedCategory === cat.id && styles.categoryPickerTextSelected]}>
              {cat.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Text style={styles.label}>Description:</Text>
      <TextInput
        placeholder="Enter item description..."
        value={description}
        onChangeText={setDescription}
        style={styles.input}
      />

      <Text style={styles.label}>Station (optional):</Text>
      <ScrollView style={styles.stationPicker} nestedScrollEnabled>
        <TouchableOpacity
          onPress={() => setSelectedStation('')}
          style={[styles.stationItem, !selectedStation && styles.stationItemSelected]}
        >
          <Text style={[styles.stationText, !selectedStation && styles.stationTextSelected]}>
            All Stations
          </Text>
        </TouchableOpacity>
        {stationList.map(station => (
          <TouchableOpacity
            key={station}
            onPress={() => setSelectedStation(station)}
            style={[styles.stationItem, selectedStation === station && styles.stationItemSelected]}
          >
            <Text style={[styles.stationText, selectedStation === station && styles.stationTextSelected]}>
              {station}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Button title="Search" onPress={performSearch} />

      {loading && <ActivityIndicator size="large" style={{ marginTop: 20 }} />}

      {results.length > 0 && (
        <View style={styles.resultsContainer}>
          <Text style={styles.resultsHeading}>Found {results.length} matches:</Text>
          <FlatList
            data={results}
            renderItem={renderResultItem}
            keyExtractor={item => item.id}
            scrollEnabled={false}
          />
        </View>
      )}
    </ScrollView>
  );
}

// Item Detail Screen
function ItemDetailScreen({ route, navigation }) {
  const { item, isMyItem } = route.params;
  const reportDate = item.reportedAt?.toDate ? item.reportedAt.toDate() : new Date();
  const [loading, setLoading] = useState(false);
  
  const handleMarkAsReturned = () => {
    navigation.navigate('ReturnStation', { item });
  };
  
  return (
    <ScrollView style={styles.container}>
      <Text style={styles.heading}>Item Details</Text>
      
      {item.status === 'returned' && (
        <View style={styles.returnedBanner}>
          <Text style={styles.returnedText}>✓ Item Returned</Text>
          <Text style={styles.returnedStation}>at {item.returnStation}</Text>
          {item.returnDate && (
            <Text style={styles.returnedDate}>
              on {new Date(item.returnDate).toLocaleDateString()}
            </Text>
          )}
        </View>
      )}
      
      {item.imageBase64 && (
        <Image 
          source={{ uri: `data:image/jpeg;base64,${item.imageBase64}` }} 
          style={styles.detailImage}
        />
      )}
      
      <View style={styles.detailContainer}>
        <Text style={styles.detailLabel}>Category:</Text>
        <Text style={styles.detailText}>
          {itemCategories.find(c => c.id === item.category)?.name || 'Uncategorized'}
        </Text>
        
        <Text style={styles.detailLabel}>Description:</Text>
        <Text style={styles.detailText}>{item.description}</Text>
        
        <Text style={styles.detailLabel}>Station:</Text>
        <Text style={styles.detailText}>{item.station}</Text>
        
        <Text style={styles.detailLabel}>Date:</Text>
        <Text style={styles.detailText}>
          {new Date(item.incidentDate).toLocaleDateString()}
        </Text>
        
        {item.startTime && item.endTime && (
          <>
            <Text style={styles.detailLabel}>Time Range:</Text>
            <Text style={styles.detailText}>
              {new Date(item.startTime).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})} - 
              {new Date(item.endTime).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}
            </Text>
          </>
        )}
        
        <Text style={styles.detailLabel}>Reported on:</Text>
        <Text style={styles.detailText}>{reportDate.toLocaleDateString()}</Text>
        
        <Text style={styles.detailLabel}>Status:</Text>
        <Text style={[styles.detailText, styles.statusText, 
          item.status === 'returned' && styles.statusReturned]}>
          {item.status === 'returned' ? 'Returned' : 'Active'}
        </Text>
      </View>
      
      {item.status !== 'returned' && (
        <>
          {isMyItem && item.type === 'found' && (
            <Button 
              title="Mark as Returned to Station" 
              onPress={handleMarkAsReturned}
            />
          )}
          <View style={{ height: 10 }} />
          <Button 
            title="Contact Finder" 
            onPress={() => Alert.alert('Contact', 'Contact feature coming soon!')}
          />
        </>
      )}
    </ScrollView>
  );
}

// Return Station Screen
function ReturnStationScreen({ route, navigation }) {
  const { item } = route.params;
  const [selectedStation, setSelectedStation] = useState(item.station);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      await updateDoc(doc(db, 'foundItems', item.id), {
        status: 'returned',
        returnStation: selectedStation,
        returnDate: serverTimestamp()
      });
      
      Alert.alert(
        'Success!', 
        `Item marked as returned to ${selectedStation} station.`,
        [{ text: 'OK', onPress: () => navigation.navigate('Home') }]
      );
    } catch (error) {
      Alert.alert('Error', 'Failed to update item status. Please try again.');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { justifyContent: 'space-between' }]}>
      <View>
        <Text style={styles.heading}>Where did you return the item?</Text>
        <Text style={styles.subtext}>
          Select the MRT station where you handed over the item to station staff or lost & found counter.
        </Text>
      </View>
      
      <ScrollView style={styles.scroll}>
        {stationList.map(station => (
          <TouchableOpacity
            key={station}
            onPress={() => setSelectedStation(station)}
            style={[
              styles.stationItem,
              selectedStation === station && styles.stationItemSelected
            ]}
          >
            <Text
              style={[
                styles.stationText,
                selectedStation === station && styles.stationTextSelected
              ]}
            >
              {station}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      
      {loading ? (
        <ActivityIndicator size="large" style={{ marginVertical: 20 }} />
      ) : (
        <Button
          title="Confirm Return"
          onPress={handleSubmit}
        />
      )}
    </View>
  );
}

// My Reports Screen
function MyReportsScreen({ navigation }) {
  const [lostItems, setLostItems] = useState([]);
  const [foundItems, setFoundItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('found');

  useEffect(() => {
    loadMyReports();
  }, []);

  const loadMyReports = async () => {
    try {
      // In a real app, you'd filter by user ID
      const lostSnapshot = await getDocs(collection(db, 'lostItems'));
      const foundSnapshot = await getDocs(collection(db, 'foundItems'));
      
      setLostItems(lostSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })));
      
      setFoundItems(foundSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })));
    } catch (error) {
      Alert.alert('Error', 'Failed to load reports');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity 
      style={styles.reportItem}
      onPress={() => navigation.navigate('ItemDetail', { item, isMyItem: true })}
    >
      <View style={styles.reportHeader}>
        <Text style={styles.reportDescription}>{item.description}</Text>
        {item.status === 'returned' && (
          <Text style={styles.returnedBadge}>Returned</Text>
        )}
      </View>
      <Text style={styles.reportCategory}>
        {itemCategories.find(c => c.id === item.category)?.name || 'Uncategorized'}
      </Text>
      <Text style={styles.reportStation}>{item.station}</Text>
      {item.status === 'returned' && (
        <Text style={styles.returnInfo}>
          Returned to {item.returnStation} on {new Date(item.returnDate).toLocaleDateString()}
        </Text>
      )}
      <Text style={styles.reportDate}>
        Reported: {item.reportedAt?.toDate ? new Date(item.reportedAt.toDate()).toLocaleDateString() : 'Unknown'}
      </Text>
    </TouchableOpacity>
  );

  const currentItems = activeTab === 'lost' ? lostItems : foundItems;

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>My Reports</Text>
      
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'found' && styles.activeTab]}
          onPress={() => setActiveTab('found')}
        >
          <Text style={[styles.tabText, activeTab === 'found' && styles.activeTabText]}>
            Found Items ({foundItems.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'lost' && styles.activeTab]}
          onPress={() => setActiveTab('lost')}
        >
          <Text style={[styles.tabText, activeTab === 'lost' && styles.activeTabText]}>
            Lost Items ({lostItems.length})
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" style={{ marginTop: 50 }} />
      ) : (
        <FlatList
          data={currentItems}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              No {activeTab} items reported yet
            </Text>
          }
        />
      )}
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
        <Stack.Screen name="Search"      component={SearchScreen} />
        <Stack.Screen name="ItemDetail"  component={ItemDetailScreen} />
        <Stack.Screen name="ReturnStation" component={ReturnStationScreen} />
        <Stack.Screen name="MyReports"   component={MyReportsScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  center:      { flex:1, justifyContent:'center', alignItems:'center', padding:20 },
  container:   { flex:1, padding:20, backgroundColor:'#fff' },
  heading:     { fontSize:24, marginBottom:20, textAlign:'center' },
  subheading:  { fontSize:18, marginBottom:10, fontWeight:'600' },
  subtext:     { fontSize:14, color:'#666', marginBottom:20, textAlign:'center' },
  label:       { fontSize:16, marginBottom:8, fontWeight:'500' },
  input:       { 
    borderWidth:1, 
    padding:10, 
    marginBottom:20, 
    borderRadius:4, 
    backgroundColor:'#f5f5f5',
    minHeight: 60,
    textAlignVertical: 'top'
  },
  categorySelector: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 15,
    marginBottom: 20,
    backgroundColor: '#f9f9f9'
  },
  categoryText: {
    fontSize: 16,
    color: '#333'
  },
  categoryPlaceholder: {
    fontSize: 16,
    color: '#999'
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    maxHeight: '80%'
  },
  modalHeading: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center'
  },
  categoryList: {
    maxHeight: 400,
    marginBottom: 20
  },
  categoryItem: {
    paddingVertical: 15,
    paddingHorizontal: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee'
  },
  categoryItemText: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 5
  },
  categoryItemHint: {
    fontSize: 14,
    color: '#666'
  },
  categoryPicker: {
    maxHeight: 150,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    marginBottom: 15
  },
  categoryPickerItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderColor: '#eee'
  },
  categoryPickerItemSelected: {
    backgroundColor: '#E8F0FF'
  },
  categoryPickerText: {
    fontSize: 14
  },
  categoryPickerTextSelected: {
    color: '#3366FF',
    fontWeight: 'bold'
  },
  datetimeRow: { flexDirection:'row', justifyContent:'space-between', marginBottom:20 },
  timeRangeContainer: { 
    flexDirection:'row', 
    justifyContent:'space-around', 
    marginTop:10,
    marginBottom:20 
  },
  timeButton: {
    flex:1,
    alignItems:'center',
    marginHorizontal:10
  },
  timeLabel: {
    fontSize:16,
    marginBottom:8,
    color:'#666'
  },
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
  },
  searchTypeContainer: {
    flexDirection: 'row',
    marginBottom: 20,
    gap: 10
  },
  typeButton: {
    flex: 1,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#3366FF',
    borderRadius: 8,
    alignItems: 'center'
  },
  typeButtonActive: {
    backgroundColor: '#3366FF'
  },
  typeButtonText: {
    fontSize: 16,
    color: '#3366FF'
  },
  typeButtonTextActive: {
    color: '#fff',
    fontWeight: 'bold'
  },
  stationPicker: {
    maxHeight: 200,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    marginBottom: 20
  },
  resultsContainer: {
    marginTop: 20
  },
  resultsHeading: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10
  },
  resultItem: {
    backgroundColor: '#f5f5f5',
    padding: 15,
    marginBottom: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd'
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 5
  },
  resultDescription: {
    fontSize: 16,
    fontWeight: 'bold',
    flex: 1
  },
  resultCategory: {
    fontSize: 14,
    color: '#3366FF',
    marginBottom: 5,
    fontStyle: 'italic'
  },
  matchScore: {
    fontSize: 14,
    color: '#3366FF',
    fontWeight: 'bold'
  },
  resultStation: {
    fontSize: 14,
    color: '#666',
    marginBottom: 5
  },
  returnedIndicator: {
    fontSize: 14,
    color: '#4CAF50',
    fontWeight: 'bold',
    marginBottom: 5
  },
  matchReasonsContainer: {
    marginTop: 5
  },
  matchReason: {
    fontSize: 12,
    color: '#888',
    marginLeft: 10
  },
  resultImage: {
    width: 80,
    height: 80,
    marginTop: 10,
    borderRadius: 4
  },
  detailImage: {
    width: 300,
    height: 300,
    alignSelf: 'center',
    marginBottom: 20,
    borderRadius: 8
  },
  detailContainer: {
    backgroundColor: '#f5f5f5',
    padding: 15,
    marginBottom: 20,
    borderRadius: 8
  },
  detailLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 10,
    marginBottom: 5
  },
  detailText: {
    fontSize: 16,
    marginBottom: 10
  },
  statusText: {
    color: '#FF9800',
    fontWeight: 'bold'
  },
  statusReturned: {
    color: '#4CAF50'
  },
  returnedBanner: {
    backgroundColor: '#4CAF50',
    padding: 15,
    borderRadius: 8,
    marginBottom: 20,
    alignItems: 'center'
  },
  returnedText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold'
  },
  returnedStation: {
    color: '#fff',
    fontSize: 16,
    marginTop: 5
  },
  returnedDate: {
    color: '#fff',
    fontSize: 14,
    marginTop: 5
  },
  tabContainer: {
    flexDirection: 'row',
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd'
  },
  tab: {
    flex: 1,
    paddingVertical: 15,
    alignItems: 'center'
  },
  activeTab: {
    borderBottomWidth: 3,
    borderBottomColor: '#3366FF'
  },
  tabText: {
    fontSize: 16,
    color: '#666'
  },
  activeTabText: {
    color: '#3366FF',
    fontWeight: 'bold'
  },
  reportItem: {
    backgroundColor: '#f9f9f9',
    padding: 15,
    marginBottom: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#eee'
  },
  reportHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  reportDescription: {
    fontSize: 16,
    fontWeight: 'bold',
    flex: 1
  },
  reportCategory: {
    fontSize: 14,
    color: '#3366FF',
    marginBottom: 5,
    fontStyle: 'italic'
  },
  returnedBadge: {
    backgroundColor: '#4CAF50',
    color: '#fff',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    fontSize: 12,
    fontWeight: 'bold'
  },
  reportStation: {
    fontSize: 14,
    color: '#666',
    marginBottom: 5
  },
  returnInfo: {
    fontSize: 13,
    color: '#4CAF50',
    marginBottom: 5,
    fontStyle: 'italic'
  },
  reportDate: {
    fontSize: 12,
    color: '#999'
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 50,
    fontSize: 16,
    color: '#999'
  }
});